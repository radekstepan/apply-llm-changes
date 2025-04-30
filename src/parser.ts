// File: src/parser.ts
// src/parser.ts
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { marked } from 'marked'; // Import marked

/**
 * Walks up from startDir until it finds package.json or node_modules,
 * falling back to process.cwd() if none.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, 'node_modules'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const packageRoot = findPackageRoot(__dirname);
dotenv.config({ path: path.join(packageRoot, '.env') });

// LLM client setup
const apiKey = process.env.LLM_API_KEY;
const baseURL = process.env.LLM_API_BASE_URL;
const model = process.env.LLM_MODEL || 'gpt-4o-mini'; // Or your preferred default

let client: OpenAI | null = null;
if (apiKey && baseURL) {
    client = new OpenAI({ apiKey, baseURL });
} else {
    console.warn('LLM_API_KEY or LLM_API_BASE_URL not found in environment. determineFilePath will throw errors.');
}


/**
 * Ask the LLM to assign a full relative file path to the snippet.
 * Must return the complete path (including all folders) or NO_PATH.
 */
export async function determineFilePath(snippet: string): Promise<string> {
  if (!client) {
      throw new Error('LLM client not initialized. Missing API Key or Base URL.');
  }
  try {
    const resp = await client.chat.completions.create({
        model,
        messages: [
        {
            role: 'system',
            content: [
            'You are an assistant that assigns the full relative file path to a code snippet.',
            'Analyze the snippet content and any surrounding context provided.',
            'Determine the most likely full relative file path (e.g., src/components/Button.tsx, packages/utils/src/helpers.js).',
            'Ensure the path is relative to a project root and uses forward slashes (/).',
            'Do not include absolute paths (e.g., /home/user/...) or URLs.',
            'If you cannot confidently determine a reasonable file path for the snippet, respond with exactly the string NO_PATH.',
            'Do not add any explanation, preamble, or markdown formatting to your response. Respond only with the path or NO_PATH.'
            ].join(' ')
        },
        { role: 'user', content: `Assign a file path to the following code snippet:\n\n\`\`\`\n${snippet}\n\`\`\`` } // Provide snippet in a code block for context
        ]
    });

    const choice = resp.choices?.[0];
    let content = choice?.message?.content?.trim();

    if (!content) {
        console.warn('LLM response was empty, assuming NO_PATH.');
        return 'NO_PATH';
    }

    // Sometimes models might still add markdown fences
    content = content.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim();

    // Basic validation, reject obviously bad paths
    if (content.startsWith('/') || content.startsWith('C:') || content.startsWith('http:') || content.startsWith('https:') || content.includes('..')) {
        console.warn(`LLM returned potentially unsafe or invalid path "${content}", treating as NO_PATH.`);
        return 'NO_PATH';
    }

    // Normalize backslashes just in case
    content = content.replace(/\\/g, '/');

    return content;

  } catch (error: any) {
      console.error(`Error calling LLM API: ${error.message}`);
      // Decide how to handle API errors - rethrow, return NO_PATH, etc.
      // Returning NO_PATH might be safer for unattended operation.
      return 'NO_PATH'; // Or rethrow error if failure should stop the process
  }
}

export type FileData = { content: string; format: string }; // format can be lang hint or generic
export type FilesMap = Map<string, FileData>;

/**
 * Extracts fenced code blocks using the 'marked' parser,
 * calls the LLM for its file path, and returns a map of files to write.
 * Skips any block where the LLM returns NO_PATH.
 *
 * @param input The markdown input string.
 * @returns A Promise resolving to a FilesMap containing the paths and content.
 */
export async function extractAllCodeBlocks(input: string): Promise<FilesMap> {
    // Instantiate the map *inside* the function
    const filesToWrite: FilesMap = new Map();

    console.log("Parsing input with marked...");
    const tokens = marked.lexer(input);
    let blockIndex = 0;
    const processingPromises: Promise<void>[] = []; // Collect promises for concurrent LLM calls

    marked.walkTokens(tokens, (token) => {
        if (token.type === 'code') {
            blockIndex++;
            const currentBlockIndex = blockIndex; // Capture index for async context
            const snippetRaw = token.text ?? '';
            const snippet = snippetRaw.trim();
            const lang = token.lang || 'unknown'; // Get language hint if available

            if (!snippet) {
                console.log(`Skipping empty code block #${currentBlockIndex}.`);
                return; // Skip empty blocks
            }

            console.log(`Queueing processing for code block #${currentBlockIndex} (lang: ${lang}, length: ${snippet.length})...`);

            // Create a promise for processing this block
            const processPromise = (async () => {
                let filePath: string;
                try {
                    filePath = await determineFilePath(snippet);
                } catch (err: any) {
                    // Error is already logged in determineFilePath
                    console.error(`Skipping block #${currentBlockIndex} due to LLM error.`);
                    return; // Skip block on LLM error
                }

                if (filePath === 'NO_PATH') {
                    console.log(`LLM returned NO_PATH for block #${currentBlockIndex}. Skipping.`);
                    return; // Skip blocks with no mapped path
                }

                console.log(`LLM mapped block #${currentBlockIndex} to path: ${filePath}`);

                // Note: Concurrent writes to the map are generally safe in JS single-threaded event loop
                // If a race condition on overwriting becomes an issue, synchronize access or handle conflicts post-processing.
                if (filesToWrite.has(filePath)) {
                    console.warn(`Warning: Overwriting file path "${filePath}" from a previous block (Block #${currentBlockIndex}).`);
                }

                filesToWrite.set(filePath, {
                    content: snippetRaw,
                    format: `markdown code block (lang: ${lang})`
                });
            })();
            processingPromises.push(processPromise);
        }
    });

    // Wait for all LLM calls and map insertions to complete
    await Promise.all(processingPromises);

    console.log(`Finished processing ${blockIndex} potential code blocks. Returning map with ${filesToWrite.size} entries.`);
    // Return the populated map
    return filesToWrite;
}
