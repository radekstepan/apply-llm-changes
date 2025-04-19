export const explicitCommentBlockRegex = /\/\*\s*START OF\s*(?<path>.*?)\s*\*\/\r?\n?(?<content>.*?)\r?\n?\/\*\s*END OF\s*\1\s*\*\//gs;
export const explicitTagBlockRegex = /<file\s+(?:path|name|filename)\s*=\s*["'](?<path>.*?)["']\s*>\r?\n?(?<content>.*?)\r?\n?<\/file>/gis;

export type FileData = {
  content: string;
  format: string; // e.g. "Comment Block", "Tag Block", "Markdown Block"
};
export type FilesMap = Map<string, FileData>;

export function extractExplicitBlocks(
  input: string,
  regex: RegExp,
  formatName: string,
  filesToWrite: FilesMap
): string {
  let remainingInput = input;
  for (const match of input.matchAll(regex)) {
    const filePath = match.groups?.path?.trim();
    const contentMatch = match.groups?.content;
    const fullMatch = match[0];
    if (filePath && contentMatch !== undefined && fullMatch) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const content = contentMatch
        .replace(/^\r?\n/, '')
        .replace(/\r?\n\s*$/, '');
      if (filesToWrite.has(normalizedPath)) {
        console.warn(`[${formatName}] Overwriting ${normalizedPath}`);
      }
      filesToWrite.set(normalizedPath, { content, format: formatName });
      remainingInput = remainingInput.replace(
        fullMatch,
        `\n[LLM_APPLY_Processed ${formatName} for ${normalizedPath}]\n`
      );
    } else {
      console.warn(`[${formatName}] Failed to parse block.`);
    }
  }
  return remainingInput;
}

/**
 * New: Regex-based Markdown‑code‑block extractor.
 * Finds every fenced block and looks one line up for a path.
 */
export function extractMarkdownBlocksWithPeg(
  markdownInput: string,
  filesToWrite: FilesMap
): void {
  const formatName = "Markdown Block";
  // match ````lang\n ... \n````
  const fenceRegex = /```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdownInput)) !== null) {
    const fullFence     = match[0];
    const codeContent   = match[1]; // Capture group 1: can be string or undefined
    const fenceStartIdx = match.index;

    // Defensive check: codeContent should always be a string (possibly empty) if match is not null
    if (codeContent === undefined) {
      console.warn(`[${formatName}] Regex match found but code content capture group is undefined.`);
      continue;
    }

    // Look upward for the last non-blank line before this fence
    const beforeText = markdownInput.slice(0, fenceStartIdx);
    const lines      = beforeText.split(/\r?\n/);

    // drop any trailing empty lines
    // Use a more robust loop that ensures access is safe
    while (lines.length > 0) {
      // Check the last element *after* ensuring lines.length > 0
      const last = lines[lines.length - 1];
      // Ensure last is not undefined before calling trim
      if (last !== undefined && last.trim() === "") {
        lines.pop();
      } else {
        break; // Stop if the last line is not empty or undefined
      }
    }

    // If all preceding lines were empty or there were no lines
    if (!lines.length) {
        continue;
    }

    // Now lines.length > 0, so the last element should exist.
    const lastLine = lines[lines.length - 1];

    // Explicit check to satisfy TypeScript's strict null checks, even though
    // the logic above should prevent `lastLine` from being undefined here.
    if (lastLine === undefined) {
        console.warn("[Markdown Parser] Logic error: lastLine unexpectedly undefined.");
        continue;
    }

    let path: string | null = null;

    // 1) Heading style: ## File: foo/bar.ext
    // lastLine is now confirmed to be a string by the check above
    const h = lastLine.match(/#+\s*(?:File:)?\s*`?(.+?)`?:?$/);
    if (h && h[1] !== undefined) {
      // Assign result
      path = h[1];
    } else {
      // 2) Inline backticks: ... `foo/bar.ext`...
      // lastLine is confirmed string
      const inl = lastLine.match(/`([^`]+)`/);
      if (inl && inl[1] !== undefined) {
        // Assign result
        path = inl[1];
      } else {
        // 3) Standalone path: exactly foo/bar.ext
        // lastLine is confirmed string
        const stand = lastLine.match(/^[ \t]*([^\s].+\.[A-Za-z0-9_]+)[ \t]*$/);
        if (stand && stand[1] !== undefined) {
          // Assign result
          path = stand[1];
        }
      }
    }

    if (!path) {
      // nothing that looks like a path—skip silently
      continue;
    }

    // Normalize: backslashes → slash, collapse duplicates
    const normalized = path
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');

    // Prepare content (strip leading/trailing blank line)
    // codeContent is guaranteed string here due to the check at the beginning of the loop
    const cleaned = codeContent
      .replace(/^\r?\n/, '')
      .replace(/\r?\n$/, '');

    // If we've already seen this file via explicit blocks, skip or overwrite
    const existing = filesToWrite.get(normalized);
    if (existing) {
      if (existing.format !== formatName) {
        console.log(`[${formatName}] Skipping ${normalized} (already defined by ${existing.format})`);
        continue;
      } else {
        console.warn(`[${formatName}] Overwriting Markdown block for ${normalized}`);
      }
    } else {
      console.log(`[${formatName}] Found: ${normalized}`);
    }

    filesToWrite.set(normalized, { content: cleaned, format: formatName });
  }
}
