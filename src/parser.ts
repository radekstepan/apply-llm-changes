/*
 * src/parser.ts
 * Contains functions to parse input text and extract file blocks
 * in various formats (explicit comments, explicit tags, Markdown).
 */
// Import specific token types needed directly
import { marked, Token, Tokens } from 'marked';

// --- Existing Regexes for Explicit Blocks ---
export const explicitCommentBlockRegex = /\/\*\s*START OF\s*(?<path>.*?)\s*\*\/\r?\n?(?<content>.*?)\r?\n?\/\*\s*END OF\s*\1\s*\*\//gs;
export const explicitTagBlockRegex = /<file\s+(?:path|name|filename)\s*=\s*["'](?<path>.*?)["']\s*>\r?\n?(?<content>.*?)\r?\n?<\/file>/gis;

// --- NEW: Regexes for path extraction within Markdown ---

// Regex to find a path within a potential header comment block at the start of code content.
// Matches /* ... */ and looks for a line starting with '*' followed by a plausible path.
const headerCommentPathRegex = /^\s*\/\*([\s\S]*?)\*\//;
// Match lines like '* path/to/file.ext' or '* path/to/file.ext ' inside the comment, capturing the non-whitespace part after '*'
const pathInCommentLineRegex = /^\s*\*\s*(\S+?)\s*$/;

// Path patterns to look for in preceding Markdown tokens (heading/paragraph)
const pathPatterns = [
    // ## File: `path/to/file.ext` or ## File: path/to/file.ext (from Heading token)
    { name: "Heading", regex: /^(?:#+\s*(?:File|Path):?)\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
    // Paragraph containing `path/to/file.ext` potentially with other text
    { name: "Inline Backticks", regex: /`((?:[^`\\]|\\.)+\.[^`\s/\\]+)`/, captureGroup: 1 },
    // Paragraph *exactly* matching a path (from Paragraph token text)
    // Allows common path characters, requires extension-like part.
    { name: "Standalone Path", regex: /^[ \t]*((?:[^\\/\s?*:"<>|]+\/)*[^\\/\s?*:"<>|]+\.[A-Za-z0-9_]+)[ \t]*$/, captureGroup: 1 },
    // Paragraph starting with File: or Path: (from Paragraph token text)
    { name: "Explicit Marker", regex: /^(?:File|Path):\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
];

// --- Types ---
export type FileData = {
  content: string;
  format: string; // e.g. "Comment Block", "Tag Block", "Markdown Block"
};
export type FilesMap = Map<string, FileData>;

// --- extractExplicitBlocks remains the same ---
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
        .replace(/^\r?\n/, '') // Remove leading newline only if present
        .replace(/\r?\n\s*$/, ''); // Remove trailing newline and any trailing whitespace
      if (filesToWrite.has(normalizedPath)) {
        console.warn(`[${formatName}] Overwriting ${normalizedPath} (previously found by ${filesToWrite.get(normalizedPath)?.format})`);
      }
      filesToWrite.set(normalizedPath, { content, format: formatName });
      remainingInput = remainingInput.replace(
        fullMatch,
        `\n[LLM_APPLY_Processed ${formatName} for ${normalizedPath}]\n`
      );
    } else {
      console.warn(`[${formatName}] Failed to parse explicit block (path or content missing). Match: ${fullMatch?.substring(0, 100)}...`);
    }
  }
  return remainingInput;
}


// --- Helper Functions for Markdown Parsing ---

/**
 * Checks if a string is a plausible relative file path candidate.
 * Focuses on structure rather than OS validity.
 */
function isValidPathCandidate(candidate: string | undefined | null): candidate is string {
    if (!candidate) return false;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 255) return false; // Basic length check

    // Reject absolute paths (simplistic check)
    if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) return false;

    // Avoid matching URLs
    if (/^(https?|ftp):\/\//i.test(trimmed)) return false;

    // Must contain at least one slash (forward or back) OR a dot (suggesting extension/relative)
    const hasPathChars = /[\\/.]/.test(trimmed);

    // Avoid common sentence endings if it contains spaces (less likely to be just a path)
    const notLikelySentence = !(/[.,;!?]$/.test(trimmed) && trimmed.includes(' '));

    // Avoid strings with clearly invalid path characters (simplistic)
    const hasValidChars = !/[<>:"|?*\x00-\x1F]/g.test(trimmed);

    // console.log(`DEBUG isValidPathCandidate: Candidate='${trimmed}', hasPathChars=${hasPathChars}, notLikelySentence=${notLikelySentence}, hasValidChars=${hasValidChars}`);
    return hasPathChars && notLikelySentence && hasValidChars;
}


/**
 * Tries extracting a path from a text string using defined patterns.
 * @param text The text content of a preceding token (heading/paragraph).
 * @returns A valid path candidate string or null.
 */
function extractPathFromPrecedingText(text: string | undefined): string | null {
    if (!text) return null;
    const trimmedText = text.trim();
    // console.log(`DEBUG extractPathFromPrecedingText: Attempting from: "${trimmedText}"`);

    for (const pattern of pathPatterns) {
        const match = trimmedText.match(pattern.regex);
        if (match) {
            const potentialPath = match[pattern.captureGroup]?.trim();
            // console.log(`DEBUG extractPathFromPrecedingText: Pattern "${pattern.name}" matched: "${potentialPath}"`);
            if (isValidPathCandidate(potentialPath)) {
                // console.log(`DEBUG extractPathFromPrecedingText: Path validated: "${potentialPath}"`);
                return potentialPath;
            } else {
                // console.log(`DEBUG extractPathFromPrecedingText: Path "${potentialPath}" failed validation.`);
            }
        }
    }
    // console.log(`DEBUG extractPathFromPrecedingText: No valid path pattern matched or validated for text: "${trimmedText}"`);
    return null;
}

/**
 * Tries extracting a path from a potential header comment at the start of code content.
 * @param codeContent The raw content of the code block.
 * @returns A valid path candidate string or null.
 */
function extractPathFromHeaderComment(codeContent: string): string | null {
    if (!codeContent) return null;

    const commentMatch = codeContent.match(headerCommentPathRegex);
    if (commentMatch) {
        const commentContent = commentMatch[1]; // Content between /* and */
        // *** FIX 1: Check if commentContent was actually captured ***
        if (typeof commentContent === 'string') {
            const commentLines = commentContent.split(/\r?\n/);
            // console.log(`DEBUG extractPathFromHeaderComment: Found comment block, checking lines:`, commentLines);

            for (const line of commentLines) {
                const lineMatch = line.match(pathInCommentLineRegex); // Check lines like '* path/to/file.ext'
                const potentialPath = lineMatch?.[1]?.trim();
                // console.log(`DEBUG extractPathFromHeaderComment: Checking line "${line.trim()}". Match: ${potentialPath}`);

                if (isValidPathCandidate(potentialPath)) {
                    // console.log(`DEBUG extractPathFromHeaderComment: Path validated: "${potentialPath}"`);
                    return potentialPath;
                }
            }
        } else {
            // console.log(`DEBUG extractPathFromHeaderComment: Comment block matched, but capture group was empty or invalid.`);
        }
    }
    // console.log(`DEBUG extractPathFromHeaderComment: No valid path found in header comment.`);
    return null;
}

/**
 * Extracts file blocks from Markdown using the `marked` parser.
 * Looks for code blocks and attempts to find a corresponding file path by:
 * 1. Checking the immediately preceding non-space token (heading or paragraph).
 * 2. Checking for a path comment at the start of the code block itself.
 */
export function extractMarkdownBlocksWithParser(
  markdownInput: string,
  filesToWrite: FilesMap
): void {
  const formatName = "Markdown Block";
  let tokens: Token[];

  try {
     // Use GFM tables and breaks options for common Markdown flavors
     tokens = marked.lexer(markdownInput, { gfm: true, breaks: false });
  } catch (error) {
    console.error(`[${formatName}] Error parsing Markdown:`, error);
    return;
  }

  // console.log("DEBUG Parser: Tokens:", JSON.stringify(tokens.map(t => ({ type: t.type, raw: t.raw.substring(0, 50) + '...' })), null, 2));

  for (let i = 0; i < tokens.length; i++) {
    const currentToken = tokens[i];

    // --- Find Code Blocks ---
    if (currentToken?.type === 'code') {
        const codeToken = currentToken as Tokens.Code;
        // Use 'text' for fenced blocks, 'raw' might contain fences/lang
        const codeContent = codeToken.text ?? '';

        // --- Attempt to Find Path ---
        let path: string | null = null;
        let foundBy: string | null = null; // Track how the path was found

        // 1. Check Preceding Token (skip spaces)
        let precedingTokenIndex = i - 1;
        let precedingToken = tokens[precedingTokenIndex];
        while (precedingToken?.type === 'space' && precedingTokenIndex > 0) {
            // console.log(`DEBUG Parser: Skipping space token at index ${precedingTokenIndex}`);
            precedingTokenIndex--;
            precedingToken = tokens[precedingTokenIndex];
        }

        if (precedingToken) {
             // console.log(`DEBUG Parser: Checking preceding token at index ${precedingTokenIndex}, type: ${precedingToken.type}, raw: "${precedingToken.raw.substring(0, 50)}..."`);
             let textToSearch: string | undefined;
             if (precedingToken.type === 'heading') textToSearch = (precedingToken as Tokens.Heading).text;
             else if (precedingToken.type === 'paragraph') textToSearch = (precedingToken as Tokens.Paragraph).text;
             else if (precedingToken.type === 'text') textToSearch = (precedingToken as Tokens.Text).text; // Handle simple text nodes too

             path = extractPathFromPrecedingText(textToSearch);
             if (path) {
                 foundBy = 'Preceding Token';
                 // console.log(`DEBUG Parser: Path found via preceding token: ${path}`);
             }
        }

        // 2. If no path from preceding token, check for Header Comment Path
        if (!path) {
            // console.log(`DEBUG Parser: No path from preceding token, checking header comment.`);
            path = extractPathFromHeaderComment(codeContent);
             if (path) {
                 foundBy = 'Header Comment';
                 // console.log(`DEBUG Parser: Path found via header comment: ${path}`);
            }
        }

        // --- Process if Path Found ---
        if (path && foundBy) {
            // Path Normalization
            const normalized = path
                .trim()
                .replace(/\\/g, '/') // Convert backslashes
                .replace(/\/+/g, '/'); // Collapse multiple slashes

            // console.log(`DEBUG Parser: Normalized path: ${normalized}`);

            // Use the raw text from the token, trim surrounding whitespace/newlines common in LLM output
            const cleanedContent = codeContent
                .replace(/^\s*\r?\n/, '') // Remove leading blank lines/whitespace
                .replace(/\r?\n\s*$/, ''); // Remove trailing blank lines/whitespace

            const existing = filesToWrite.get(normalized);
            if (existing) {
                 // Allow overwriting if found again by Markdown, but warn. Explicit blocks take precedence.
                if (existing.format !== formatName) {
                    console.log(`[${formatName}] Skipping ${normalized} (already defined by ${existing.format})`);
                    continue; // Skip this markdown block
                } else {
                    console.warn(`[${formatName}] Overwriting ${normalized} (previously found via ${foundBy})`);
                }
            } else {
                console.log(`[${formatName}] Found: ${normalized} (via ${foundBy})`);
            }

            filesToWrite.set(normalized, { content: cleanedContent, format: formatName });

        } else {
             // Only warn if it looks like code but no path was confidently identified
             if (codeContent.length > 10) { // Avoid warning for empty blocks
                 // *** FIX 2: Removed .line access ***
                 console.warn(`[${formatName}] Code block found, but could not determine file path.`);
                 // console.log("DEBUG Parser: Code block content (start):", codeContent.substring(0, 100) + "...");
             }
        }
    } // End if (token type is code)
  } // End loop through tokens
}