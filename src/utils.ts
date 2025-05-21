import * as fsAsync from 'fs/promises';
import * as path from 'path';

/**
 * Strips JavaScript-style comments (single-line and multi-line) from a JSON string.
 * It then attempts to parse and re-stringify the JSON to ensure it's valid and
 * to provide consistent formatting (2-space indentation).
 * If parsing/re-stringifying fails (e.g., the input was not valid JSON even after
 * stripping comments), it returns the comment-stripped string, cleaned of blank lines
 * and with each line trimmed.
 *
 * @param jsonString The JSON string, potentially with comments.
 * @returns A comment-free JSON string, pretty-printed if valid, or the raw stripped string.
 */
export function stripJsonComments(jsonString: string): string {
  // Regex to match:
  // 1. Escaped quotes: \\"
  // 2. Strings: "(?:\\"|[^"])*" (non-capturing group for string content)
  // 3. Single-line comments: \/\/.*
  // 4. Multi-line comments: \/\*[\s\S]*?\*\/
  // Comments are captured in group 1 (g1). If g1 is a comment, replace with "", otherwise keep the match m.
  const stripped = jsonString.replace(
    /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
    (match, group1) => (group1 ? '' : match)
  );

  try {
    // Attempt to parse and re-stringify to validate and prettify
    const jsonObject = JSON.parse(stripped);
    return JSON.stringify(jsonObject, null, 2);
  } catch (error: any) {
    // This warning is useful for the CLI context.
    console.warn(
      `Failed to parse JSON after stripping comments. Returning raw stripped string (cleaned). Error: ${error.message}`
    );
    // Fallback to returning the regex-stripped string if it's not valid JSON
    // (e.g., if it was just a fragment or already malformed).
    // Clean up by trimming each line and removing empty lines.
    return stripped
      .split('\n')
      .map((line) => line.trim()) // Trim whitespace from each line
      .filter((line) => line !== '') // Remove lines that are now empty
      .join('\n'); // Join them back
  }
}

/**
 * Strips outer markdown code block fences if present.
 * This function expects to receive content that was potentially extracted
 * from an outer set of fences, and this content might itself be a full
 * markdown code block (e.g. ```lang\ncode\n```).
 * If so, it strips these "inner" fences to get the raw code.
 *
 * @param content The string content to process.
 * @returns The content, potentially with its own markdown fences stripped.
 */
export function stripOuterMarkdownFences(content: string): string {
  const lines = content.split('\n');

  if (lines.length >= 2) {
    const firstLine = lines[0]!.trimEnd();
    const lastLine = lines[lines.length - 1]!.trim();

    // Regex for the opening fence: ``` followed by optional language, then optional whitespace
    const openingFenceRegex = /^```([\w.-]+)?\s*$/;

    if (openingFenceRegex.test(firstLine) && lastLine === '```') {
      // Extract content lines between the fences
      let contentLines = lines.slice(1, -1);

      // Remove blank lines from the beginning of the extracted content
      while (contentLines.length > 0 && contentLines[0]!.trim() === '') {
        contentLines.shift();
      }
      // Remove blank lines from the end of the extracted content
      while (
        contentLines.length > 0 &&
        contentLines[contentLines.length - 1]!.trim() === ''
      ) {
        contentLines.pop();
      }
      return contentLines.join('\n');
    }
  }
  // If not a block that itself is wrapped in fences, return original content
  return content;
}

/**
 * Recursively scans a directory and returns a list of relative directory paths.
 *
 * @param baseDir The absolute path to the base directory to scan.
 * @returns A Promise that resolves to an array of relative directory paths.
 *          Paths use forward slashes.
 */
export async function getDirectoryStructure(
  baseDir: string
): Promise<string[]> {
  const results: string[] = [];
  const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build']);

  async function scanDir(currentPath: string) {
    let entries;
    try {
      entries = await fsAsync.readdir(currentPath, { withFileTypes: true });
    } catch (error: any) {
      console.warn(
        `Warning: Could not read directory ${currentPath}. Error: ${error.message}. Skipping.`
      );
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirName = entry.name;
        const fullPath = path.join(currentPath, dirName);

        // Check if directory should be ignored
        if (ignoredDirs.has(dirName) || dirName.startsWith('.')) {
          continue;
        }

        // Calculate relative path and normalize to forward slashes
        const relativePath = path
          .relative(baseDir, fullPath)
          .replace(/\\/g, '/');

        // Add to results if it's not an empty string (which can happen for baseDir itself if we decide to include it)
        // For this implementation, we only add subdirectories.
        if (relativePath) {
          results.push(relativePath);
        }
        await scanDir(fullPath); // Recursive call
      }
    }
  }

  // Start scanning from the base directory itself.
  // We also need to consider if the baseDir itself should be scanned for subdirectories,
  // but not added to the results as an empty string.
  // The first call to scanDir will handle its children.
  await scanDir(baseDir);
  return results;
}
