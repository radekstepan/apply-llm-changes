import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';

/**
 * Starting from `startDir`, walk upward until you find a directory
 * containing `package.json` or `node_modules`. Return that dir.
 * If none is found, fall back to process.cwd().
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json')) ||
        fs.existsSync(path.join(dir, 'node_modules'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;  // reached filesystem root
    dir = parent;
  }
  return process.cwd();
}

// __dirname is where this compiled file lives (e.g. <root>/dist)
const packageRoot = findPackageRoot(__dirname);
dotenv.config({ path: path.join(packageRoot, '.env') });

// --- Explicit block regexes ---
export const explicitCommentBlockRegex =
  /\/\*\s*START OF\s*(?<path>.*?)\s*\*\/\r?\n?(?<content>.*?)\r?\n?\/\*\s*END OF\s*\1\s*\*\//gs;
export const explicitTagBlockRegex =
  /<file\s+(?:path|name|filename)\s*=\s*['"](?<path>.*?)['"]\s*>\r?\n?(?<content>.*?)\r?\n?<\/file>/gis;

export type FileData = { content: string; format: string };
export type FilesMap = Map<string, FileData>;

// Load config from .env
const apiKey = process.env.LLM_API_KEY;
const baseURL = process.env.LLM_API_BASE_URL;
const model = process.env.LLM_MODEL || 'gpt-4o-mini';

if (!apiKey) throw new Error('Missing LLM_API_KEY in environment');
if (!baseURL) throw new Error('Missing LLM_API_BASE_URL in environment');

// Instantiate OpenAI client configured to your endpoint
const client = new OpenAI({
  baseURL,
  apiKey,
});

/**
 * Prompt the LLM to assign a relative file path based on context snippet.
 * Responds with exactly that file path string, or NO_PATH if none.
 */
export async function determineFilePath(context: string): Promise<string> {
  const resp = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are an assistant that assigns the complete relative file path to a code snippet based on context.',
          'Always include the full directory structure from the project root (e.g. packages/foo/src/file.js),',
          'and never omit any parent folders.',
          'If the snippet cannot be mapped to any file, respond with exactly NO_PATH.'
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          'Here is the context for the upcoming code block:\n\n',
          context,
          '\n\nRespond with exactly one of the following:\n',
          '- A full relative file path including all directories (e.g. packages/foo/src/file.js)\n',
          '- NO_PATH if you cannot determine a suitable path.\n',
          'Do not include any other text, comments, or formatting.'
        ].join('')
      },
    ],
  });

  const choice = resp.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new Error('LLM response did not include a file path.');
  return content.trim();
}

/**
 * Extract fenced code blocks, call LLM for filenames,
 * and populate `filesToWrite` with each block's contents,
 * skipping blocks where LLM returns NO_PATH.
 */
export async function extractMarkdownBlocksWithParser(
  markdownInput: string,
  filesToWrite: FilesMap
): Promise<void> {
  const lines = markdownInput.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line?.trim().startsWith('```')) {
      // Gather context: up to 3 lines before, fence line, first 3 lines of the block
      const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
      const fence = line;
      const snippet: string[] = [];
      let j = i + 1;

      while (j < lines.length && !lines[j]?.trim().startsWith('```')) {
        snippet.push(lines[j]!);
        j++;
      }

      const context = [prev, fence, snippet.slice(0, 3).join('\n')]
        .filter(Boolean)
        .join('\n');

      let filePath: string;
      try {
        filePath = await determineFilePath(context);
      } catch (err) {
        console.error('LLM call failed:', err);
        i = j + 1;
        continue;
      }

      // Skip blocks where LLM indicates no path
      if (filePath === 'NO_PATH') {
        // console.warn('LLM returned NO_PATH; skipping this code block.');
        i = j + 1;
        continue;
      }

      const fullCode = snippet.join('\n');
      filesToWrite.set(filePath, {
        content: fullCode,
        format: 'Markdown Block (via LLM)',
      });

      i = j + 1;
    } else {
      i++;
    }
  }
}

/**
 * Extract explicit START/END comment or <file> tag blocks
 * and write them into `filesToWrite`.
 */
export function extractExplicitBlocks(
  input: string,
  regex: RegExp,
  formatName: string,
  filesToWrite: FilesMap
): string {
  let remaining = input;

  for (const match of remaining.matchAll(regex)) {
    const raw = match[0];
    const p = match.groups?.path?.trim();
    const c = match.groups?.content ?? '';

    if (p) {
      const normalized = p.replace(/\\/g, '/');
      const cleaned = c.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '');

      filesToWrite.set(normalized, { content: cleaned, format: formatName });
      remaining = remaining.replace(
        raw,
        `\n[LLM_APPLY_Processed ${formatName} for ${normalized}]\n`
      );
    }
  }

  return remaining;
}
