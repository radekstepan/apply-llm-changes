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
const FOLDER_HINT_MAX_DEPTH = parseInt(process.env.FOLDER_HINT_MAX_DEPTH || "3");

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
// --- Folder Structure Hinting ---

/**
 * Recursively scans a directory and generates a string representation of its structure.
 * @param dirPath The path to the directory to scan.
 * @param maxDepth The maximum depth of directories to scan.
 * @param currentDepth The current depth of recursion (used internally).
 * @param prefix The prefix for the current line (used internally).
 * @returns A string representing the folder structure.
 */
function scanDir(
  dirPath: string,
  maxDepth: number,
  currentDepth: number = 0,
  prefix: string = ''
): string {
  if (currentDepth > maxDepth) {
    return '';
  }

  let structure = '';
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const filteredEntries = entries.filter(
      (entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules'
    );

    for (let i = 0; i < filteredEntries.length; i++) {
      const entry = filteredEntries[i];
      const entryPrefix = prefix + (i === filteredEntries.length - 1 ? '`-- ' : '|-- ');
      const entryName = entry.isDirectory() ? `${entry.name}/` : entry.name;
      structure += `${entryPrefix}${entryName}\n`;
      if (entry.isDirectory()) {
        const nestedPrefix = prefix + (i === filteredEntries.length - 1 ? '    ' : '|   ');
        structure += scanDir(
          path.join(dirPath, entry.name),
          maxDepth,
          currentDepth + 1,
          nestedPrefix
        );
      }
    }
  } catch (error: any) {
    // console.warn(`Could not read directory ${dirPath}: ${error.message}`);
    // Silently ignore errors for individual directory reads to make it robust
  }
  return structure;
}

/**
 * Generates a hint string representing the folder structure of the project.
 * @param rootDir The root directory of the project.
 * @param maxDepth The maximum depth to scan for the folder structure.
 * @returns A string with the folder structure hint, or an empty string if an error occurs.
 */
export function getFolderStructureHint(rootDir: string, maxDepth: number = 2): string {
  if (maxDepth < 0) return ''; // No negative depth
  let hint = "Project folder structure (up to " + maxDepth + " levels deep):\n/\n";
  try {
    hint += scanDir(rootDir, maxDepth, 0, '');
    return hint;
  } catch (error: any) {
    console.warn(`Error generating folder structure hint: ${error.message}`);
    return ''; // Return empty string if top-level scan fails
  }
}


// --- Path Determination ---

/**
 * Uses the configured LLM to determine a relative file path for a given code snippet.
 * @param snippet The code snippet (potentially with surrounding context).
 * @returns A promise resolving to the determined relative file path (using forward slashes) or 'NO_PATH' if unable to determine or an error occurs.
 */
export async function determineFilePath(snippet: string): Promise<string> {
  if (!client) {
    console.error(
      'LLM client not initialized. Cannot determine path for markdown block.'
    );
    return 'NO_PATH';
  }

  console.log(
    `Determining file path via LLM for snippet starting with: "${snippet
      .substring(0, 50)
      .replace(/\n/g, '\\n')}..."`
  );

  const projectRoot = findPackageRoot(__dirname);
  const folderHint = getFolderStructureHint(projectRoot, FOLDER_HINT_MAX_DEPTH);

  const systemMessages = [
    'You are an assistant that assigns the full relative file path to a code snippet.',
    'Analyze the snippet content and any surrounding context provided.',
    'Determine the most likely full relative file path (e.g., src/components/Button.tsx, packages/utils/src/helpers.js) based on common project structures, comments, or import statements within the snippet.',
    'Ensure the path is relative to a project root and uses forward slashes (/).',
    'Do not include absolute paths (e.g., /home/user/...) or URLs.',
  ];

  if (folderHint) {
    systemMessages.push(
      'Here is the current folder structure of the project to help you determine the path. Please use this as a strong hint:',
      folderHint
    );
  }

  systemMessages.push(
    'If you cannot confidently determine a reasonable file path for the snippet, respond with exactly the string NO_PATH.',
    'Do not add any explanation, preamble, or markdown formatting to your response. Respond only with the path or NO_PATH.'
  );

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemMessages.join(' '),
        },
        {
          role: 'user',
          content: `Assign a file path to the following code snippet:\n\n\`\`\`\n${snippet}\n\`\`\``,
        },
      ],
      temperature: 0.1, // Low temperature for deterministic path finding
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
 * Handles explicit  tags first.
 * Then, uses an LLM to determine paths for standard markdown code blocks.
 * Explicit tags take precedence over LLM-determined paths for the same file.
 * @param input The raw input string containing potential file blocks.
 * @returns A promise resolving to a Map where keys are relative file paths and values are { content, format }.
 */
export async function extractAllCodeBlocks(input: string): Promise<FilesMap> {
  const filesToWrite: FilesMap = new Map();
  let remainingInput = input;

  console.log('Step 1: Pre-processing for explicit <file> tags...');

  // Regex to find  blocks
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

  console.log(
    `Iterating through ${tokens.length} marked tokens for code blocks...`
  );

  // Iterate through markdown tokens to find code blocks
  for (const token of tokens) {
    if (token.type === 'code') {
      codeBlockCount++;

      const snippetRaw = token.text ?? ''; // Use original content for writing
      const lang = token.lang || 'unknown';
      const snippetTrimmed = snippetRaw.trim(); // Use trimmed for LLM analysis

      if (!snippetTrimmed) {
        console.log(`Skipping empty markdown code block #${codeBlockCount}.`);
        continue; // Skip empty blocks
      }

      console.log(
        `Processing markdown code block #${codeBlockCount} (lang: ${lang}, length: ${snippetRaw.length}). Calling LLM...`
      );

      let llmFilePath: string;
      try {
        // Ask LLM to determine the path for the trimmed snippet
        llmFilePath = await determineFilePath(snippetTrimmed);
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

      // Store the original, *untrimmed* content from the markdown block
      filesToWrite.set(llmFilePath, {
        content: snippetRaw,
        format: `markdown code block (lang: ${lang})`,
      });
    } // End if (token.type === 'code')
  } // End loop through tokens

  console.log(
    `Finished processing. Found ${filesToWrite.size} files to write.`
  );
  return filesToWrite;
}
