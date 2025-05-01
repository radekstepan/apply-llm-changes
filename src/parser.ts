import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { marked } from 'marked';

// findPackageRoot function remains the same...
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
const rawKey = process.env.LLM_API_KEY;
// if rawKey matches an existing env var name, use that; otherwise use rawKey directly
const apiKey = rawKey && process.env[rawKey] ? process.env[rawKey] : rawKey;
const baseURL = process.env.LLM_API_BASE_URL;
const model = process.env.LLM_MODEL || 'gpt-4o-mini'; // Or your preferred default

let client: OpenAI | null = null;
if (apiKey && baseURL) {
  client = new OpenAI({ apiKey, baseURL });
  console.log('LLM Client Initialized.'); // Add confirmation
} else {
  console.warn(
    'LLM_API_KEY or LLM_API_BASE_URL not found in environment. determineFilePath will throw errors.'
  );
}

/**
 * Ask the LLM to assign a full relative file path to the snippet.
 * Must return the complete path (including all folders) or NO_PATH.
 */
export async function determineFilePath(snippet: string): Promise<string> {
  if (!client) {
    console.error('LLM client not initialized attempt in determineFilePath.');
    throw new Error('LLM client not initialized. Missing API Key or Base URL.');
  }
  console.log(
    `Determining file path for snippet starting with: "${snippet.substring(0, 50).replace(/\n/g, '\\n')}..."`
  );
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
            'Do not add any explanation, preamble, or markdown formatting to your response. Respond only with the path or NO_PATH.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Assign a file path to the following code snippet:\n\n\`\`\`\n${snippet}\n\`\`\``,
        },
      ],
    });

    const choice = resp.choices?.[0];
    let content = choice?.message?.content?.trim();

    if (!content) {
      console.warn('LLM response was empty for snippet, assuming NO_PATH.');
      return 'NO_PATH';
    }
    console.log(`LLM raw response: "${content}"`);

    content = content
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    if (
      content.startsWith('/') ||
      content.startsWith('C:') ||
      content.startsWith('http:') ||
      content.startsWith('https:') ||
      content.includes('..')
    ) {
      console.warn(
        `LLM returned potentially unsafe or invalid path "${content}", treating as NO_PATH.`
      );
      return 'NO_PATH';
    }

    content = content.replace(/\\/g, '/');

    console.log(`LLM determined path: "${content}"`);
    return content;
  } catch (error: any) {
    console.error(
      `Error calling LLM API in determineFilePath: ${error.message}`
    );
    return 'NO_PATH';
  }
}

export type FileData = { content: string; format: string };
export type FilesMap = Map<string, FileData>;

/**
 * Extracts fenced code blocks using 'marked', calls LLM sequentially for paths,
 * and returns a map of files to write.
 */
export async function extractAllCodeBlocks(input: string): Promise<FilesMap> {
  const filesToWrite: FilesMap = new Map();
  console.log('Parsing input with marked (sequential processing)...');
  const tokens = marked.lexer(input);
  let blockIndex = 0;
  let codeBlockCount = 0; // Count actual code blocks found

  console.log(`Iterating through ${tokens.length} tokens sequentially...`);

  // Iterate directly over the tokens from the lexer
  for (const token of tokens) {
    // Check if the current token is a code block
    if (token.type === 'code') {
      codeBlockCount++; // Increment count only for code blocks
      blockIndex++; // Keep track of overall block number if needed, or use codeBlockCount

      // Access properties directly from the token (TS infers type within the 'if')
      const snippetRaw = token.text ?? '';
      const snippet = snippetRaw.trim();
      const lang = token.lang || 'unknown';

      if (!snippet) {
        console.log(`Skipping empty code block #${codeBlockCount}.`);
        continue; // Skip empty blocks
      }

      console.log(
        `Processing code block #${codeBlockCount} (lang: ${lang}, length: ${snippet.length})...`
      );

      // Await each LLM call sequentially
      let filePath: string;
      try {
        filePath = await determineFilePath(snippet);
      } catch (err: any) {
        console.error(
          `Skipping block #${codeBlockCount} due to LLM error during await.`
        );
        continue; // Skip block on LLM error
      }

      if (filePath === 'NO_PATH') {
        console.log(
          `LLM returned NO_PATH for block #${codeBlockCount}. Skipping.`
        );
        continue; // Skip blocks with no mapped path
      }

      console.log(`LLM mapped block #${codeBlockCount} to path: ${filePath}`);

      if (filesToWrite.has(filePath)) {
        console.warn(
          `Warning: Overwriting file path "${filePath}" from a previous block (Block #${codeBlockCount}).`
        );
      }

      filesToWrite.set(filePath, {
        content: snippetRaw,
        format: `markdown code block (lang: ${lang})`,
      });
    } // End if (token.type === 'code')
  } // End loop through tokens

  console.log(
    `Finished sequential processing. Found ${codeBlockCount} code blocks. Returning map with ${filesToWrite.size} entries.`
  );
  return filesToWrite;
}
