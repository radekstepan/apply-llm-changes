// Import specific token types needed directly
import { marked, Token, Tokens } from 'marked';

// Keep existing regexes for explicit blocks
export const explicitCommentBlockRegex = /\/\*\s*START OF\s*(?<path>.*?)\s*\*\/\r?\n?(?<content>.*?)\r?\n?\/\*\s*END OF\s*\1\s*\*\//gs;
export const explicitTagBlockRegex = /<file\s+(?:path|name|filename)\s*=\s*["'](?<path>.*?)["']\s*>\r?\n?(?<content>.*?)\r?\n?<\/file>/gis;

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
        console.warn(`[${formatName}] Overwriting ${normalizedPath}`);
      }
      filesToWrite.set(normalizedPath, { content, format: formatName });
      remainingInput = remainingInput.replace(
        fullMatch,
        `\n[LLM_APPLY_Processed ${formatName} for ${normalizedPath}]\n`
      );
    } else {
      console.warn(`[${formatName}] Failed to parse explicit block.`);
    }
  }
  return remainingInput;
}


// --- NEW: Markdown parsing logic using `marked` ---

// Define path patterns to apply to token text
const pathPatterns = [
    // ## File: `path/to/file.ext` or ## File: path/to/file.ext (from Heading token)
    { name: "Heading", regex: /^(?:#+\s*(?:File|Path):?)\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
    // Paragraph containing `path/to/file.ext` potentially with other text
    // Ensure it captures paths with backslashes correctly from within backticks
    { name: "Inline Backticks", regex: /`((?:[^`\\]|\\.)+\.[^`\s/\\]+)`/, captureGroup: 1 }, // Adjusted to capture common path chars
    // Paragraph *exactly* matching a path (from Paragraph token text)
    { name: "Standalone Path", regex: /^[ \t]*([^\s/?\\*:"<>|]+(?:[\\/][^\s/?\\*:"<>|]+)*\.[A-Za-z0-9_]+)[ \t]*$/, captureGroup: 1 }, // Allow / and \ in standalone, ensure extension
    // Paragraph starting with File: or Path: (from Paragraph token text)
    { name: "Explicit Marker", regex: /^(?:File|Path):\s*`?([^`\s].*?)`?:?$/, captureGroup: 1 },
];

// Helper function to check if a string looks like a plausible path
function isValidPathCandidate(candidate: string): boolean {
    if (!candidate) return false;
    const trimmedCandidate = candidate.trim();
    if (!trimmedCandidate) return false;

    // Main check: Contains a dot OR a slash (forward or back)
    const hasPathChars = trimmedCandidate.includes('.') || trimmedCandidate.includes('/') || trimmedCandidate.includes('\\');
    // Basic length checks
    const reasonableLength = trimmedCandidate.length > 1 && trimmedCandidate.length < 256;
    // Avoid matching things that look like URLs accidentally
    const notUrl = !/^(https?|ftp):\/\//.test(trimmedCandidate);
    // Avoid matching things that end like sentences (unless it's just the path)
    const notSentenceEnding = !(/[.,;!?]$/.test(trimmedCandidate) && trimmedCandidate.includes(' '));

    // console.log(`DEBUG isValidPathCandidate: Candidate='${trimmedCandidate}', hasPathChars=${hasPathChars}, reasonableLength=${reasonableLength}, notUrl=${notUrl}, notSentenceEnding=${notSentenceEnding}`);
    return hasPathChars && reasonableLength && notUrl && notSentenceEnding;
}


// Function to try extracting a path from a text string using defined patterns
function extractPathFromText(text: string | undefined): string | null {
    if (!text) return null;
    // console.log(`DEBUG extractPathFromText: Attempting to extract from: "${text}"`);

    for (const pattern of pathPatterns) {
        const match = text.match(pattern.regex);
        if (match) {
            // console.log(`DEBUG extractPathFromText: Pattern "${pattern.name}" matched.`);
            const capturedValue = match[pattern.captureGroup];
            if (typeof capturedValue === 'string' && capturedValue.trim()) {
                const potentialPath = capturedValue.trim();
                // console.log(`DEBUG extractPathFromText: Potential path from pattern "${pattern.name}": "${potentialPath}"`);
                if (isValidPathCandidate(potentialPath)) {
                    // console.log(`DEBUG extractPathFromText: Path validated: "${potentialPath}"`);
                    return potentialPath;
                } else {
                    // console.log(`DEBUG extractPathFromText: Path "${potentialPath}" failed validation.`);
                }
            } else {
                // console.log(`DEBUG extractPathFromText: Pattern "${pattern.name}" matched, but capture group ${pattern.captureGroup} was invalid:`, capturedValue);
            }
        }
    }
    // console.log(`DEBUG extractPathFromText: No valid path pattern matched or validated for text: "${text}"`);
    return null;
}

/**
 * Extracts file blocks from Markdown using the `marked` parser.
 * Looks for code blocks and checks the immediately preceding token
 * (heading or paragraph), skipping over space tokens.
 */
export function extractMarkdownBlocksWithParser(
  markdownInput: string,
  filesToWrite: FilesMap
): void {
  const formatName = "Markdown Block";
  let tokens: Token[];

  try {
     tokens = marked.lexer(markdownInput);
  } catch (error) {
    console.error(`[${formatName}] Error parsing Markdown:`, error);
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const currentToken = tokens[i];

    if (currentToken?.type === 'code') {
        const codeToken = currentToken as Tokens.Code;
        const codeContent = codeToken.text ?? '';

        // --- MODIFIED LOGIC to find preceding token ---
        let precedingTokenIndex = i - 1;
        let precedingToken = tokens[precedingTokenIndex];

        // Skip over space tokens if necessary
        if (precedingToken?.type === 'space') {
            // console.log(`DEBUG Parser: Skipping space token at index ${precedingTokenIndex}`);
            precedingTokenIndex = i - 2;
            precedingToken = tokens[precedingTokenIndex];
        }
        // --- END MODIFIED LOGIC ---


        let path: string | null = null;

        // Check the potentially adjusted preceding token
        if (precedingToken) {
             // console.log(`DEBUG Parser: Checking preceding token at index ${precedingTokenIndex}, type: ${precedingToken.type}, raw: "${precedingToken.raw.substring(0,50)}..."`);
             if (precedingToken.type === 'heading') {
                 const textToken = precedingToken as Tokens.Heading;
                 path = extractPathFromText(textToken.text);
             } else if (precedingToken.type === 'paragraph') {
                 const textToken = precedingToken as Tokens.Paragraph;
                 path = extractPathFromText(textToken.text);
             }
             else if (precedingToken.type === 'text') { // Handle simple text nodes too
                 const textToken = precedingToken as Tokens.Text;
                 path = extractPathFromText(textToken.text);
             }
        } else {
             // console.log("DEBUG Parser: No valid preceding token found for code block at index", i);
        }

        if (!path) {
            // console.log("DEBUG Parser: No path extracted for code block at index", i);
            continue;
        }
        // console.log(`DEBUG Parser: Path extracted: ${path} for code block at index`, i);


        // Path Normalization happens here!
        const normalized = path
            .trim()
            .replace(/\\/g, '/') // Convert backslashes *first*
            .replace(/\/+/g, '/'); // Collapse multiple slashes

        // console.log(`DEBUG Parser: Normalized path: ${normalized}`);

        const cleaned = codeContent.trim();

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
}
