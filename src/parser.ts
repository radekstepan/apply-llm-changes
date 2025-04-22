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

// --- Regexes for path extraction within Markdown ---

// Regex to find a path within a potential header comment block at the start of code content.
const headerCommentPathRegex = /^\s*\/\*([\s\S]*?)\*\//;
const pathInCommentLineRegex = /^\s*\*\s*(\S+?)\s*$/;

// Path patterns to look for in preceding Markdown tokens (heading/paragraph/text)
const pathPatterns = [
    // ## File: `path/to/file.ext` or ## File: path/to/file.ext (from Heading token)
    { name: "Heading", regex: /^(?:#+\s*(?:File|Path):?)\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
    // Paragraph containing `path/to/file.ext` potentially with other text
    { name: "Inline Backticks", regex: /`((?:[^`\\]|\\.)+\.[^`\s/\\]+)`/, captureGroup: 1 },
    // Paragraph *exactly* matching a path (from Paragraph token text)
    { name: "Standalone Path", regex: /^[ \t]*((?:[^\\/\s?*:"<>|]+\/)*[^\\/\s?*:"<>|]+\.[A-Za-z0-9_]+)[ \t]*$/, captureGroup: 1 },
    // Paragraph starting with File: or Path: (from Paragraph token text)
    { name: "Explicit Marker", regex: /^(?:File|Path):\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
];

// Regex for the format: **`path/to/file.ext`** within a list item
const listItemPathRegex = /\*\*\s*`([^`\s](?:[^`]*[^`\s])?)`\s*\*\*/;

// Regex patterns to find a path comment on the first line of a code block
const firstLineCommentPathPatterns = [
    // Matches // path/to/file, # path/to/file, // File: path/to/file, # File: path/to/file
    { name: "Single Line Comment", regex: /^\s*(?:\/\/|#)\s*(?:File:\s*)?(\S+)\s*$/, captureGroup: 1 },
    // Matches /* path/to/file */ (single line only)
    { name: "Block Comment Single Line", regex: /^\s*\/\*\s*(?:File:\s*)?(\S+)\s*\*\/$/, captureGroup: 1 },
    // Matches // filepath: path/to/file or # filepath: path/to/file
    { name: "Filepath Marker", regex: /^\s*(?:\/\/|#)\s*filepath:\s*(\S+)\s*$/, captureGroup: 1 },
];

// *** ADDED: Regex for YAML Front Matter-like path block ***
// Matches '---' followed by 'path: actual/path' and ending '---', allowing whitespace and newlines.
// Capture group 1 gets the path itself.
const yamlFrontMatterPathRegex = /^\s*---\s*path:\s*(\S+)\s*---/s;


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
 * Tries extracting a path from a text string using defined patterns (Heading, Paragraph, etc.).
 * @param text The text content of a preceding token.
 * @returns A valid path candidate string or null.
 */
function extractPathFromPrecedingTextToken(text: string | undefined): string | null {
    if (!text) return null;
    const trimmedText = text.trim();
    // console.log(`DEBUG extractPathFromPrecedingTextToken: Attempting from: "${trimmedText}"`);

    for (const pattern of pathPatterns) {
        const match = trimmedText.match(pattern.regex);
        if (match) {
            const potentialPath = match[pattern.captureGroup]?.trim();
            // console.log(`DEBUG extractPathFromPrecedingTextToken: Pattern "${pattern.name}" matched: "${potentialPath}"`);
            if (isValidPathCandidate(potentialPath)) {
                // console.log(`DEBUG extractPathFromPrecedingTextToken: Path validated: "${potentialPath}"`);
                return potentialPath;
            } else {
                // console.log(`DEBUG extractPathFromPrecedingTextToken: Path "${potentialPath}" failed validation.`);
            }
        }
    }
    // console.log(`DEBUG extractPathFromPrecedingTextToken: No valid path pattern matched or validated for text: "${trimmedText}"`);
    return null;
}

/**
 * Tries extracting a path from a YAML front matter-like block (`--- path: ... ---`).
 * @param text The raw text content of a preceding token (likely paragraph or html).
 * @returns A valid path candidate string or null.
 */
function extractPathFromYamlFrontMatter(text: string | undefined): string | null {
    if (!text) return null;
    // console.log(`DEBUG extractPathFromYamlFrontMatter: Checking text: "${text.substring(0, 50)}..."`);
    const match = text.match(yamlFrontMatterPathRegex);
    if (match) {
        const potentialPath = match[1]?.trim();
        // console.log(`DEBUG extractPathFromYamlFrontMatter: Regex matched, potential path: "${potentialPath}"`);
        if (isValidPathCandidate(potentialPath)) {
            // console.log(`DEBUG extractPathFromYamlFrontMatter: Path validated: "${potentialPath}"`);
            return potentialPath;
        } else {
            // console.log(`DEBUG extractPathFromYamlFrontMatter: Path "${potentialPath}" failed validation.`);
        }
    }
    // console.log(`DEBUG extractPathFromYamlFrontMatter: No valid front matter path found.`);
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
        if (typeof commentContent === 'string') {
            const commentLines = commentContent.split(/\r?\n/);
            for (const line of commentLines) {
                const lineMatch = line.match(pathInCommentLineRegex);
                const potentialPath = lineMatch?.[1]?.trim();
                if (isValidPathCandidate(potentialPath)) {
                    return potentialPath;
                }
            }
        }
    }
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
            if (isValidPathCandidate(potentialPath)) {
                return potentialPath;
            }
        }
    }
    return null;
}


/**
 * Extracts file blocks from Markdown using the `marked` parser.
 * Looks for code blocks and attempts to find a corresponding file path by checking:
 * 1. The immediately preceding non-space token for a YAML front matter block (`--- path: ... ---`). // *** ADDED ***
 * 2. The immediately preceding non-space token (heading, paragraph, text) for other patterns.
 * 3. A C-style header comment block at the start of the code.
 * 4. A path in a `**\`path\`**` format within a list item token preceding the code block.
 * 5. A path comment on the first line of the code block itself (including optional 'File: ' prefix).
 * It also cleans potential stray ``` fences from the start/end of the code content.
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
        const codeContent = codeToken.text ?? '';

        // --- Attempt to Find Path ---
        let path: string | null = null;
        let foundBy: string | null = null; // Track how the path was found

        // Find the first non-space token immediately preceding the code block
        let precedingTokenIndex = i - 1;
        while (tokens[precedingTokenIndex]?.type === 'space' && precedingTokenIndex >= 0) {
            precedingTokenIndex--;
        }
        const precedingToken = tokens[precedingTokenIndex];

        if (precedingToken) {
            // console.log(`DEBUG Parser: Checking preceding token at index ${precedingTokenIndex}, type: ${precedingToken.type}`);

            // 1. Check for YAML Front Matter Path first
            // We use 'raw' as 'text' might be processed differently for HTML/paragraph tokens
            path = extractPathFromYamlFrontMatter(precedingToken.raw);
            if (path) {
                foundBy = 'YAML Front Matter';
                // console.log(`DEBUG Parser: Path found via YAML Front Matter: ${path}`);
            }

            // 2. If not found, check for other preceding token patterns (Heading, Paragraph, Text)
            if (!path) {
                let textToSearch: string | undefined;
                if (precedingToken.type === 'heading') textToSearch = (precedingToken as Tokens.Heading).text;
                else if (precedingToken.type === 'paragraph') textToSearch = (precedingToken as Tokens.Paragraph).text;
                else if (precedingToken.type === 'text') textToSearch = (precedingToken as Tokens.Text).text;
                // Note: We don't check 'html' here, handled by YAML check

                path = extractPathFromPrecedingTextToken(textToSearch);
                if (path) {
                    foundBy = 'Preceding Token';
                    // console.log(`DEBUG Parser: Path found via preceding token: ${path}`);
                }
            }
        }

        // 3. If no path from preceding tokens, check for Header Comment Block Path in code
        if (!path) {
            // console.log(`DEBUG Parser: No path from preceding tokens, checking header comment block.`);
            path = extractPathFromHeaderCommentBlock(codeContent);
             if (path) {
                 foundBy = 'Header Comment Block';
                 // console.log(`DEBUG Parser: Path found via header comment block: ${path}`);
            }
        }

        // 4. If no path yet, check for List Item Path Format in earlier tokens
        if (!path) {
            //  console.log(`DEBUG Parser: No path yet, checking list item format.`);
            for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
                 const potentialListItemToken = tokens[j]!;
                 if (potentialListItemToken.type === 'list_item') {
                     const listItemToken = potentialListItemToken as Tokens.ListItem;
                     const listItemText = listItemToken.text;
                     const match = listItemText.match(listItemPathRegex);
                     if (match) {
                         const potentialPath = match[1]?.trim();
                         if (isValidPathCandidate(potentialPath)) {
                             path = potentialPath;
                             foundBy = 'List Item';
                             // console.log(`DEBUG Parser: Path validated from list item: ${path}`);
                             break; // Found valid path, stop this inner loop check
                         }
                     }
                     break; // Check only the first list_item encountered going backwards.
                 } else if (['space', 'list_start', 'list_end'].includes(potentialListItemToken.type)) {
                     continue;
                 } else {
                     break;
                 }
            }
        }

        // 5. If *still* no path, check for First Line Comment Path in code
        if (!path) {
            // console.log(`DEBUG Parser: No path yet, checking first line comment.`);
            path = extractPathFromFirstLineComment(codeContent);
            if (path) {
                foundBy = 'First Line Comment';
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

            // --- Clean Content ---
            let cleanedContent = codeContent
                .replace(/^\s*\r?\n/, '')
                .replace(/\r?\n\s*$/, '');

            if (foundBy === 'First Line Comment') {
                 const firstLine = cleanedContent.split(/\r?\n/, 1)[0];
                 const matchedPattern = firstLineCommentPathPatterns.find(p => firstLine?.trim().match(p.regex));
                 if (firstLine && matchedPattern) {
                    const originalFirstLineLength = firstLine.length;
                    cleanedContent = cleanedContent.substring(originalFirstLineLength).replace(/^\r?\n/, '');
                 }
            }

            cleanedContent = cleanedContent.replace(/^\s*```.*?\r?\n/, '');
            cleanedContent = cleanedContent.replace(/\r?\n\s*```\s*$/, '');
            cleanedContent = cleanedContent.trim();

            const existing = filesToWrite.get(normalized);
            if (existing) {
                if (existing.format !== formatName && existing.format !== 'Comment Block' && existing.format !== 'Tag Block') {
                     console.warn(`[${formatName}] Overwriting ${normalized} (previously found via ${existing.format} - ${foundBy})`);
                } else if (existing.format === formatName) {
                     console.warn(`[${formatName}] Overwriting ${normalized} (previously found via Markdown, now using ${foundBy})`);
                }
                 else {
                    console.log(`[${formatName}] Skipping ${normalized} (already defined by ${existing.format})`);
                    continue;
                }
            } else {
                console.log(`[${formatName}] Found: ${normalized} (via ${foundBy})`);
            }

            if (cleanedContent) {
                filesToWrite.set(normalized, { content: cleanedContent, format: formatName });
            } else {
                 console.warn(`[${formatName}] Skipping ${normalized} (content became empty after cleaning).`);
            }


        } else if (currentToken.type === 'code' && codeContent.length > 10 && !foundBy) {
            console.warn(`[${formatName}] Code block found, but could not determine file path.`);
            // console.log("DEBUG Parser: Code block content (start):", codeContent.substring(0, 100) + "...");
        }
    } // End if (token type is code)
  } // End loop through tokens
}
