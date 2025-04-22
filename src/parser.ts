// File: src/parser.ts
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

// Path patterns to look for in preceding Markdown tokens (heading/paragraph/text)
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

// Regex for the format: **`path/to/file.ext`** within a list item
const listItemPathRegex = /\*\*\s*`([^`\s](?:[^`]*[^`\s])?)`\s*\*\*/;

// Regex patterns to find a path comment on the first line of a code block
const firstLineCommentPathPatterns = [
    // *** UPDATED Regex to include optional "File:" prefix ***
    // Matches // path/to/file, # path/to/file, // File: path/to/file, # File: path/to/file
    { name: "Single Line Comment", regex: /^\s*(?:\/\/|#)\s*(?:File:\s*)?(\S+)\s*$/, captureGroup: 1 },
    // Matches /* path/to/file */ (single line only)
    // *** UPDATED Regex to include optional "File:" prefix ***
    { name: "Block Comment Single Line", regex: /^\s*\/\*\s*(?:File:\s*)?(\S+)\s*\*\/$/, captureGroup: 1 },
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
 * Focuses on structure and basic safety rather than OS validity.
 */
function isValidPathCandidate(candidate: string | undefined | null): candidate is string {
    if (!candidate) return false;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 255) return false; // Basic length check

    // Reject absolute paths (simplistic check)
    if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
        // console.log(`DEBUG isValidPathCandidate: Rejected absolute path: ${trimmed}`);
        return false;
    }

    // Reject paths attempting directory traversal upwards
    if (trimmed.startsWith('../') || trimmed.includes('/../') || trimmed.includes('\\..\\')) {
        // console.log(`DEBUG isValidPathCandidate: Rejected traversal path: ${trimmed}`);
        return false;
    }

    // Avoid matching URLs
    if (/^(https?|ftp):\/\//i.test(trimmed)) {
         // console.log(`DEBUG isValidPathCandidate: Rejected URL: ${trimmed}`);
        return false;
    }

    // Must contain at least one slash (forward or back) OR a dot (suggesting extension/relative)
    // This helps filter out random words that might accidentally match other patterns.
    const hasPathChars = /[\\/.]/.test(trimmed);
    if (!hasPathChars) {
        // console.log(`DEBUG isValidPathCandidate: Rejected - no path chars: ${trimmed}`);
        return false;
    }


    // Avoid common sentence endings if it contains spaces (less likely to be just a path)
    const notLikelySentence = !(/[.,;!?]$/.test(trimmed) && trimmed.includes(' '));
    if (!notLikelySentence) {
    //    console.log(`DEBUG isValidPathCandidate: Rejected likely sentence: ${trimmed}`);
       return false;
    }

    // Avoid strings with clearly invalid path characters (simplistic)
    // Note: Does not check for OS-specific reserved names like CON, PRN, etc.
    const hasValidChars = !/[<>:"|?*\x00-\x1F]/g.test(trimmed);
     if (!hasValidChars) {
        // console.log(`DEBUG isValidPathCandidate: Rejected invalid chars: ${trimmed}`);
        return false;
    }

    // console.log(`DEBUG isValidPathCandidate: Validated: '${trimmed}'`);
    return true; // Passed all checks
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
 * Tries extracting a path from a potential C-style header comment block
 * at the start of code content. Looks for lines like `* path/to/file.ext`.
 * @param codeContent The raw content of the code block.
 * @returns A valid path candidate string or null.
 */
function extractPathFromHeaderCommentBlock(codeContent: string): string | null {
    if (!codeContent) return null;

    const commentMatch = codeContent.match(headerCommentPathRegex);
    if (commentMatch) {
        const commentContent = commentMatch[1]; // Content between /* and */
        // Check if commentContent was actually captured
        if (typeof commentContent === 'string') {
            const commentLines = commentContent.split(/\r?\n/);
            // console.log(`DEBUG extractPathFromHeaderCommentBlock: Found comment block, checking lines:`, commentLines);

            for (const line of commentLines) {
                const lineMatch = line.match(pathInCommentLineRegex); // Check lines like '* path/to/file.ext'
                const potentialPath = lineMatch?.[1]?.trim();
                // console.log(`DEBUG extractPathFromHeaderCommentBlock: Checking line "${line.trim()}". Match: ${potentialPath}`);

                if (isValidPathCandidate(potentialPath)) {
                    // console.log(`DEBUG extractPathFromHeaderCommentBlock: Path validated: "${potentialPath}"`);
                    return potentialPath;
                }
            }
        } else {
            // console.log(`DEBUG extractPathFromHeaderCommentBlock: Comment block matched, but capture group was empty or invalid.`);
        }
    }
    // console.log(`DEBUG extractPathFromHeaderCommentBlock: No valid path found in header comment block.`);
    return null;
}

// Helper to extract path from first line comment
/**
 * Tries extracting a path from a comment on the *first line* of the code content.
 * Checks for patterns like '// path/to/file' or '# path/to/file' or '/* path/to/file * /'
 * including optional 'File: ' prefix.
 * @param codeContent The raw content of the code block.
 * @returns A valid path candidate string or null.
 */
function extractPathFromFirstLineComment(codeContent: string): string | null {
    if (!codeContent) return null;

    const firstLine = codeContent.split(/\r?\n/, 1)[0];
    if (!firstLine) return null;

    const trimmedFirstLine = firstLine.trim();
    // console.log(`DEBUG extractPathFromFirstLineComment: Checking line: "${trimmedFirstLine}"`);

    for (const pattern of firstLineCommentPathPatterns) {
        const match = trimmedFirstLine.match(pattern.regex);
        if (match) {
            const potentialPath = match[pattern.captureGroup]?.trim();
            // console.log(`DEBUG extractPathFromFirstLineComment: Pattern "${pattern.name}" matched: "${potentialPath}"`);
            if (isValidPathCandidate(potentialPath)) {
                // console.log(`DEBUG extractPathFromFirstLineComment: Path validated: "${potentialPath}"`);
                return potentialPath;
            } else {
                 // console.log(`DEBUG extractPathFromFirstLineComment: Path "${potentialPath}" failed validation.`);
            }
        }
    }
    // console.log(`DEBUG extractPathFromFirstLineComment: No valid path pattern matched or validated.`);
    return null;
}


/**
 * Extracts file blocks from Markdown using the `marked` parser.
 * Looks for code blocks and attempts to find a corresponding file path by checking:
 * 1. The immediately preceding non-space token (heading, paragraph, text).
 * 2. A C-style header comment block at the start of the code.
 * 3. A path in a `**\`path\`**` format within a list item token preceding the code block.
 * 4. A path comment on the first line of the code block itself (including optional 'File: ' prefix).
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
        let precedingPathToken: Token | undefined = undefined; // Hold the actual token that provided the path


        // 1. Check Preceding Token (skip spaces)
        let precedingTokenIndex = i - 1;
        while (tokens[precedingTokenIndex]?.type === 'space' && precedingTokenIndex >= 0) {
            precedingTokenIndex--;
        }
        const precedingToken = tokens[precedingTokenIndex];

        if (precedingToken) {
             // console.log(`DEBUG Parser: Checking preceding token at index ${precedingTokenIndex}, type: ${precedingToken.type}`);
             let textToSearch: string | undefined;
             if (precedingToken.type === 'heading') textToSearch = (precedingToken as Tokens.Heading).text;
             else if (precedingToken.type === 'paragraph') textToSearch = (precedingToken as Tokens.Paragraph).text;
             else if (precedingToken.type === 'text') textToSearch = (precedingToken as Tokens.Text).text;

             path = extractPathFromPrecedingText(textToSearch);
             if (path) {
                 foundBy = 'Preceding Token';
                 precedingPathToken = precedingToken;
                //  console.log(`DEBUG Parser: Path found via preceding token: ${path}`);
             }
        }

        // 2. If no path from preceding token, check for Header Comment Block Path
        if (!path) {
            // console.log(`DEBUG Parser: No path from preceding token, checking header comment block.`);
            path = extractPathFromHeaderCommentBlock(codeContent);
             if (path) {
                 foundBy = 'Header Comment Block';
                 // Note: This path source doesn't have a separate "preceding token"
                //  console.log(`DEBUG Parser: Path found via header comment block: ${path}`);
            }
        }

        // 3. If no path yet, check for List Item Path Format
        if (!path) {
            //  console.log(`DEBUG Parser: No path yet, checking list item format.`);
            // Allow checking further back for list items, potentially skipping other tokens
            for (let j = i - 1; j >= 0 && j >= i - 5; j--) { // Increased lookback slightly
                 const potentialListItemToken = tokens[j]!; // Assert non-null due to loop condition
                //  console.log(`DEBUG Parser: Checking token at index ${j} for list item: type=${potentialListItemToken.type}`);

                 if (potentialListItemToken.type === 'list_item') {
                     const listItemToken = potentialListItemToken as Tokens.ListItem;
                     const listItemText = listItemToken.text;
                    //  console.log(`DEBUG Parser: Found list_item token at index ${j}, text: "${listItemText}"`);

                     const match = listItemText.match(listItemPathRegex);
                     if (match) {
                         const potentialPath = match[1]?.trim();
                        //  console.log(`DEBUG Parser: List item regex matched: "${potentialPath}"`);
                         if (isValidPathCandidate(potentialPath)) {
                             path = potentialPath;
                             foundBy = 'List Item';
                             precedingPathToken = listItemToken;
                            //  console.log(`DEBUG Parser: Path validated from list item: ${path}`);
                             break; // Found valid path, stop this inner loop check
                         } else {
                            // console.log(`DEBUG Parser: Path "${potentialPath}" from list item failed validation.`);
                         }
                     }
                     // Don't 'break' immediately if path wasn't valid; maybe another list item before this one is relevant?
                     // However, only consider the *first* list item found before the code block for path matching.
                     // So we do break after checking the first list_item token encountered going backwards.
                     break;
                 } else if (['space', 'list_start', 'list_end'].includes(potentialListItemToken.type)) {
                     continue; // Skip expected intermediate tokens
                 } else {
                     // If we hit something that's not a list item or space/list markers,
                     // assume the list item format isn't applicable here.
                     break;
                 }
            }
        }

        // 4. If *still* no path, check for First Line Comment Path
        if (!path) {
            // console.log(`DEBUG Parser: No path yet, checking first line comment.`);
            path = extractPathFromFirstLineComment(codeContent);
            if (path) {
                foundBy = 'First Line Comment';
                // Note: This path source doesn't have a separate "preceding token"
                // console.log(`DEBUG Parser: Path found via first line comment: ${path}`);
            }
        }

        // --- Process if Path Found ---
        if (path && foundBy) { // Ensure we have a path and know how it was found
            // Path Normalization
            const normalized = path
                .trim()
                .replace(/\\/g, '/') // Convert backslashes
                .replace(/\/+/g, '/'); // Collapse multiple slashes

            // console.log(`DEBUG Parser: Normalized path: ${normalized}`);

            // Use the raw text from the token, trim surrounding whitespace/newlines common in LLM output
            let cleanedContent = codeContent
                .replace(/^\s*\r?\n/, '') // Remove leading blank lines/whitespace
                .replace(/\r?\n\s*$/, ''); // Remove trailing blank lines/whitespace

            // Remove the first line if it was the source of the path comment
            if (foundBy === 'First Line Comment') {
                 const firstLine = cleanedContent.split(/\r?\n/, 1)[0];
                 // Double check if firstLine indeed matches one of the patterns used to extract the path
                 const matchedPattern = firstLineCommentPathPatterns.find(p => firstLine?.trim().match(p.regex));
                 if (firstLine && matchedPattern) {
                    // Remove the first line and the following newline character(s)
                    // Calculate the length of the original first line to slice correctly
                    const originalFirstLineLength = firstLine.length;
                    cleanedContent = cleanedContent.substring(originalFirstLineLength).replace(/^\r?\n/, ''); // Remove first line + subsequent newline
                 }
            }

            const existing = filesToWrite.get(normalized);
            if (existing) {
                // Explicit blocks always overwrite Markdown blocks. Allow Markdown blocks to overwrite other Markdown blocks with a warning.
                if (existing.format !== formatName && existing.format !== 'Comment Block' && existing.format !== 'Tag Block') {
                     console.warn(`[${formatName}] Overwriting ${normalized} (previously found via ${existing.format} - ${foundBy})`);
                } else if (existing.format === formatName) {
                     // Already found by Markdown, log which detection method is winning (usually the last one if multiple apply)
                     console.warn(`[${formatName}] Overwriting ${normalized} (previously found via Markdown, now using ${foundBy})`);
                }
                 else {
                    // An explicit block (Comment or Tag) already exists, skip this Markdown block
                    console.log(`[${formatName}] Skipping ${normalized} (already defined by ${existing.format})`);
                    continue; // Skip this markdown block
                }
            } else {
                console.log(`[${formatName}] Found: ${normalized} (via ${foundBy})`);
            }

            filesToWrite.set(normalized, { content: cleanedContent, format: formatName });

        } else if (currentToken.type === 'code' && codeContent.length > 10 && !foundBy) {
            // Only warn if it's a code block, has some content, and no path was found by *any* method.
            console.warn(`[${formatName}] Code block found, but could not determine file path.`);
            // console.log("DEBUG Parser: Code block content (start):", codeContent.substring(0, 100) + "...");
        }
    } // End if (token type is code)
  } // End loop through tokens
}
