import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { marked } from 'marked';

// --- Configuration and Setup ---

/**
 * Walks up the directory tree from startDir until it finds a 'package.json'
 * or 'node_modules' directory, indicating the project root.
 * Falls back to the current working directory if neither is found.
 * @param startDir The directory to start searching from.
 * @returns The determined package root directory path.
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
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }
  return process.cwd(); // Fallback
}

// Check for .env in the current working directory first, then fallback to package root
let envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  const packageRoot = findPackageRoot(__dirname);
  envPath = path.join(packageRoot, '.env');
}
dotenv.config({ path: envPath });

// Initialize LLM client using environment variables
const rawKey = process.env.LLM_API_KEY;
// Allow LLM_API_KEY to be the actual key OR the name of another env var holding the key
const apiKey = rawKey && process.env[rawKey] ? process.env[rawKey] : rawKey;
const baseURL = process.env.LLM_API_BASE_URL;
const model = process.env.LLM_MODEL || 'gpt-4.1-mini-2025-04-14'; // Default model

// Read and parse LLM_TEMPERATURE from environment, with a default
const defaultTemperature = 0.1;
let llmTemperature = defaultTemperature;
const envTemp = process.env.LLM_TEMPERATURE;
if (envTemp) {
  const parsedTemp = parseFloat(envTemp);
  if (!isNaN(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 2) {
    llmTemperature = parsedTemp;
    console.log(`Using LLM temperature from environment: ${llmTemperature}`);
  } else {
    console.warn(
      `Invalid LLM_TEMPERATURE value "${envTemp}". Must be a number between 0 and 2. Using default: ${defaultTemperature}`
    );
  }
} else {
  console.log(`LLM_TEMPERATURE not set. Using default: ${defaultTemperature}`);
}

let client: OpenAI | null = null;
if (apiKey && baseURL) {
  client = new OpenAI({ apiKey, baseURL });
  console.log('LLM Client Initialized.');
} else {
  console.warn(
    'LLM_API_KEY or LLM_API_BASE_URL not configured in environment. Path detection for standard markdown blocks will fail.'
  );
}

// --- Types ---

export type FileData = { content: string; format: string };
export type FilesMap = Map<string, FileData>; // Map<filePath, FileData>

// --- Utility Functions ---

/**
 * Normalizes a potential file path string:
 * - Trims whitespace.
 * - Converts backslashes to forward slashes.
 * - Removes surrounding quotes.
 * Validates the path:
 * - Returns null if empty, '.', absolute, contains '..', or is otherwise unsafe.
 * @param filePath The potential file path string.
 * @returns The normalized, relative path or null if invalid/unsafe.
 */
function normalizeAndValidatePath(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;

  let normalizedPath = filePath.trim().replace(/\\/g, '/'); // Use forward slashes
  normalizedPath = normalizedPath.replace(/^["']|["']$/g, ''); // Remove surrounding quotes

  // Basic safety checks for relative paths within the current project
  if (
    normalizedPath.startsWith('/') || // Absolute Unix paths
    /^[a-zA-Z]:[\\\/]/.test(normalizedPath) || // Absolute Windows paths
    normalizedPath.includes('..') // Directory traversal
  ) {
    console.warn(`Skipping potentially unsafe or absolute path: "${filePath}"`);
    return null;
  }
  if (!normalizedPath || normalizedPath === '.') {
    console.warn(`Skipping invalid path: "${filePath}"`);
    return null;
  }

  return normalizedPath;
}

/**
 * Uses the configured LLM to determine a relative file path for a given code snippet.
 * @param snippet The code snippet (potentially with surrounding context).
 * @returns A promise resolving to the determined relative file path (using forward slashes) or 'NO_PATH' if unable to determine or an error occurs.
 */
export async function determineFilePath(snippet: string): Promise<string> {
  if (!client) {
    // Log error but return NO_PATH to allow processing of <file> tags
    console.error(
      'LLM client not initialized. Cannot determine path for markdown block.'
    );
    return 'NO_PATH';
  }

  console.log(
    `Determining file path via LLM for snippet starting with: "${snippet
      .substring(0, 80) // Increased substring length for better logging
      .replace(/\n/g, '\\n')}..."`
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
            'Determine the most likely full relative file path (e.g., src/components/Button.tsx, packages/utils/src/helpers.js) based on common project structures, comments, or import statements within the snippet.',
            'Ensure the path is relative to a project root and uses forward slashes (/).',
            'Do not include absolute paths (e.g., /home/user/...) or URLs.',
            'If you cannot confidently determine a reasonable file path for the snippet, respond with exactly the string NO_PATH.',
            'Do not add any explanation, preamble, or markdown formatting to your response. Respond only with the path or NO_PATH.',
          ].join(' '),
        },
        {
          role: 'user',
          // The snippet provided might now be a multi-line context including
          // lines before the code block, the opening fence, and first few lines of code.
          // Wrapping it in ``` ensures it's treated as a single block by the LLM,
          // even if the snippet itself contains ```.
          content: `Assign a file path to the following code snippet:\n\n\`\`\`\n${snippet}\n\`\`\``,
        },
      ],
      temperature: llmTemperature, // Use configured temperature
    });

    const choice = resp.choices?.[0];
    let content = choice?.message?.content?.trim();

    if (!content || content === 'NO_PATH') {
      console.log('LLM response was empty or explicitly NO_PATH.');
      return 'NO_PATH';
    }
    console.log(`LLM raw response: "${content}"`);

    // Clean potential markdown fences from the LLM response itself
    content = content
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    // Validate the path returned by the LLM
    const validatedPath = normalizeAndValidatePath(content);
    if (!validatedPath) {
      console.warn(
        `LLM returned invalid/unsafe path "${content}", treating as NO_PATH.`
      );
      return 'NO_PATH';
    }

    console.log(`LLM determined path: "${validatedPath}"`);
    return validatedPath;
  } catch (error: any) {
    console.error(
      `Error calling LLM API in determineFilePath: ${error.message}`
    );
    return 'NO_PATH'; // Return NO_PATH on API error
  }
}

// --- Main Extraction Logic ---

/**
 * Extracts file paths and content from input text.
 * Handles explicit <file> tags first.
 * Then, uses an LLM to determine paths for standard markdown code blocks.
 * Explicit tags take precedence over LLM-determined paths for the same file.
 * @param input The raw input string containing potential file blocks.
 * @returns A promise resolving to a Map where keys are relative file paths and values are { content, format }.
 */
export async function extractAllCodeBlocks(input: string): Promise<FilesMap> {
  const filesToWrite: FilesMap = new Map();
  let remainingInput = input;

  console.log('Step 1: Pre-processing for explicit <file> tags...');

  // Regex to find <file> blocks
  // Captures: 1=quote type, 2=path, 3=content
  const fileTagRegex = /<file\s+path=(["'])(.*?)\1>([\s\S]*?)<\/file>/g;

  // Use replace with a callback to extract info and remove the block from further processing
  remainingInput = remainingInput.replace(
    fileTagRegex,
    (match, quote, filePathRaw, contentRaw) => {
      const filePath = normalizeAndValidatePath(filePathRaw);
      if (!filePath) {
        console.warn(
          `Invalid or unsafe path found in <file> tag: "${filePathRaw}". Skipping this block.`
        );
        // Return empty string to remove this block entirely
        return '';
      }

      // Trim leading/trailing whitespace/newlines from the captured content
      const content = contentRaw.trim();

      console.log(`Found explicit <file> tag for path: "${filePath}"`);

      if (filesToWrite.has(filePath)) {
        console.warn(
          `Warning: Overwriting file path "${filePath}" from a previous block (Explicit <file> tag encountered).`
        );
      }

      filesToWrite.set(filePath, {
        content: content, // Store the cleaned content
        format: `explicit <file> tag`,
      });

      // Return an empty string to remove this block from the input passed to markdown parser
      return '';
    }
  );

  console.log(
    'Step 2: Processing remaining input with marked for standard code blocks...'
  );
  // Process the input *after* <file> tags have been removed
  const tokens = marked.lexer(remainingInput);
  let codeBlockCount = 0;
  let currentSearchIndexInRemainingInput = 0; // Tracks position in remainingInput for indexOf

  console.log(
    `Iterating through ${tokens.length} marked tokens for code blocks...`
  );

  // Iterate through markdown tokens to find code blocks
  for (const token of tokens) {
    if (token.type === 'code') {
      codeBlockCount++;

      const rawMarkdownForBlock = token.raw; // Full markdown of the block, e.g., "```ts\ncode\n```"
      const codeContentOnly = token.text ?? ''; // Just the code, e.g., "code"

      if (!codeContentOnly.trim()) {
        console.log(`Skipping empty markdown code block #${codeBlockCount}.`);
        continue; // Skip empty blocks
      }

      let contextForLLM: string;
      // Find the start of this specific token.raw in the remainingInput string.
      // currentSearchIndexInRemainingInput ensures we find the current block, not an earlier identical one.
      const blockStartIndex = remainingInput.indexOf(
        rawMarkdownForBlock,
        currentSearchIndexInRemainingInput
      );

      if (blockStartIndex === -1) {
        console.warn(
          `Could not robustly locate markdown block #${codeBlockCount} in the input to extract full context. Sending only code content to LLM.`
        );
        // Fallback: send only the code content (trimmed), similar to previous behavior.
        contextForLLM = codeContentOnly.trim();
      } else {
        // Extract text before this code block token.
        const textBeforeBlock = remainingInput.substring(0, blockStartIndex);
        const linesBeforeBlock = textBeforeBlock.split('\n');
        // Get the last 4 lines from the text before the block.
        // slice(-4) correctly handles cases where there are fewer than 4 lines.
        const fourLinesBeforeText = linesBeforeBlock.slice(-4);

        // Split the raw markdown of the block into lines.
        const blockLines = rawMarkdownForBlock.split('\n');
        const openingBackticksLine = blockLines[0]; // First line is the opening fence, e.g., "```typescript"
        // Get up to 2 lines of code immediately following the opening fence.
        // blockLines.slice(1, 3) gets elements at index 1, 2.
        const twoLinesOfCodeAfterFence = blockLines.slice(1, 3);

        contextForLLM = [
          ...fourLinesBeforeText,
          openingBackticksLine,
          ...twoLinesOfCodeAfterFence,
        ].join('\n');

        // Advance the search index for the next iteration to search *after* the current block.
        currentSearchIndexInRemainingInput =
          blockStartIndex + rawMarkdownForBlock.length;
      }

      console.log(
        `Processing markdown code block #${codeBlockCount} (lang: ${token.lang || 'unknown'}, length: ${rawMarkdownForBlock.length}).`
      );
      // For debugging, one might log the context being sent. Be mindful of log verbosity.
      // console.log(`Context for LLM (block #${codeBlockCount}):\n---\n${contextForLLM.substring(0, 200).replace(/\n/g, '\\n')}\n---`);

      let llmFilePath: string;
      try {
        // Pass the new contextForLLM (or fallback) to determineFilePath
        llmFilePath = await determineFilePath(contextForLLM);
      } catch (err: any) {
        console.error(
          `Skipping markdown block #${codeBlockCount} due to LLM error: ${
            err.message || err
          }.`
        );
        continue; // Skip block on LLM error
      }

      if (llmFilePath === 'NO_PATH') {
        console.log(
          `LLM returned NO_PATH for markdown block #${codeBlockCount}. Skipping.`
        );
        continue; // Skip blocks where LLM couldn't determine a path
      }

      console.log(
        `LLM mapped markdown block #${codeBlockCount} to path: ${llmFilePath}`
      );

      // Precedence Check: Skip if path already exists from an explicit <file> tag
      if (filesToWrite.has(llmFilePath)) {
        const existingData = filesToWrite.get(llmFilePath);
        if (existingData?.format === 'explicit <file> tag') {
          console.warn(
            `Warning: Skipping markdown block #${codeBlockCount} for path "${llmFilePath}". Path was already defined by an explicit <file> tag.`
          );
          continue; // Skip this markdown block
        } else {
          // Allow overwriting if the previous block was also a markdown block
          console.warn(
            `Warning: Overwriting file path "${llmFilePath}" from a previous markdown block (Block #${codeBlockCount}).`
          );
        }
      }

      // Store the original, *untrimmed* code content from the markdown block (token.text)
      filesToWrite.set(llmFilePath, {
        content: codeContentOnly,
        format: `markdown code block (lang: ${token.lang || 'unknown'})`,
      });
    } // End if (token.type === 'code')
  } // End loop through tokens

  console.log(
    `Finished processing. Found ${filesToWrite.size} files to write.`
  );
  return filesToWrite;
}
