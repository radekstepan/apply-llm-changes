#!/usr/bin/env node
// ^ THIS SHEBANG IS ESSENTIAL for the 'bin' command to work

// llm-apply-cli/src/index.ts
import * as fs from 'fs/promises';
import * as path from 'path';

// --- Configuration ---
const COMMON_FILE_EXTENSIONS = [
    'ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs',
    'json', 'md', 'yaml', 'yml', 'html', 'css',
    'scss', 'less', 'py', 'go', 'java', 'cs',
    'sh', 'bash', 'zsh', 'txt', 'sql', 'dockerfile',
    'gitignore', 'npmrc', 'env', 'config', 'xml', 'toml'
];
// Basic regex to identify a potential file path (might need refinement)
// Looks for sequences with '/', ending in a known extension. Handles './' prefix.
// Allows alphanumerics, underscores, hyphens, dots in path segments.
const POTENTIAL_PATH_REGEX = new RegExp(
    `(?<path>(?:\\.\\/)?(?:[\\w\\-\\.@]+\\/)+[\\w\\-\\.@]+\\.(?:${COMMON_FILE_EXTENSIONS.join('|')}))`
);
// Regex for lines that *introduce* a file path before a code block
// Allows optional keywords like "File:", "Path:", "Updating ", etc.
// Captures the path in the 'path' named group.
const FILE_INDICATOR_LINE_REGEX = new RegExp(
    `^(?:(?:File|Path|Updating|Creating|Contents of)\\s*:?\\s*)?` + // Optional keywords
    `(?<path>(?:\\.\\/)?(?:[\\w\\-\\.@]+\\/)+[\\w\\-\\.@]+\\.(?:${COMMON_FILE_EXTENSIONS.join('|')}))` + // The path itself
    `\\s*[:]?\\s*$` // Optional colon at the end, optional trailing whitespace
);


// --- Regex Definitions for Block Formats ---

// Format 1: /* START OF <path> */ ... /* END OF <path> */
const explicitCommentBlockRegex = /\/\*\s*START OF\s*(?<path>.*?)\s*\*\/\n?(?<content>.*?)\n?\/\*\s*END OF\s*\1\s*\*\//gs;

// Format 2: <file path="<path>"> ... </file> (flexible attribute name)
const explicitTagBlockRegex = /<file\s+(?:path|name|filename)\s*=\s*["'](?<path>.*?)["']\s*>\n?(?<content>.*?)\n?<\/file>/gis;

// Format 3: ```[lang]\n ... \n``` (captures content and lang)
// Needs to be paired with a preceding file path indicator
const fencedCodeBlockRegex = /```(?<lang>[a-zA-Z0-9]+)?\n(?<content>.*?)\n```/gs;


// --- Helper Functions ---

/** Reads all data from standard input. */
async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) {
                data += chunk;
            }
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

/** Ensures a directory exists, creating it recursively if necessary. */
async function ensureDirectoryExists(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    try {
        await fs.mkdir(dirname, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            console.error(`Error creating directory ${dirname}:`, error);
            throw error;
        }
    }
}

/** Extracts file path and content from explicit markers */
function extractExplicitBlocks(
    input: string,
    regex: RegExp,
    formatName: string,
    filesToWrite: Map<string, { content: string; format: string }>
): string {
    let remainingInput = input;
    const matches = Array.from(input.matchAll(regex));

    for (const match of matches) {
        if (match.groups?.path && match.groups?.content !== undefined) {
            const filePath = match.groups.path.trim();
            let content = match.groups.content;
            // Trim leading/trailing whitespace lines common in these blocks
            content = content.replace(/^\s*\n/, '').replace(/\n\s*$/, '');

            if (filesToWrite.has(filePath)) {
                console.warn(`⚠️ [${formatName}] Overwriting previous definition for: ${filePath}`);
            }
            filesToWrite.set(filePath, { content, format: formatName });
            console.log(`  🔎 Found [${formatName}]: ${filePath}`);
            // Remove the matched block from the input to avoid reprocessing
            // Use replace with the full match[0]
            remainingInput = remainingInput.replace(match[0], `\n[Processed Block for ${filePath}]\n`);
        } else {
             console.warn(`  ⚠️ [${formatName}] Found potential block but couldn't extract path/content cleanly.`);
        }
    }
    return remainingInput; // Return input with matched blocks removed/replaced
}

/** Extracts files based on path indicator line + fenced code block */
function extractImplicitBlocks(
    input: string,
    filesToWrite: Map<string, { content: string; format: string }>
) {
    const formatName = "Implicit Path + Code Block";
    // Find all fenced code blocks first, with their start index
    const codeBlockMatches = Array.from(input.matchAll(fencedCodeBlockRegex));
    const lines = input.split('\n');

    // Ensure lines array is not empty if input might be empty (though readStdin usually prevents this)
    if (lines.length === 0) return;

    let inputCharIndex = 0;
    const lineStartIndices: number[] = lines.map(line => {
        const startIndex = inputCharIndex;
        inputCharIndex += line.length + 1; // +1 for the newline char
        return startIndex;
    });

    // Ensure lineStartIndices is not empty
     if (lineStartIndices.length === 0) return;


    for (const match of codeBlockMatches) {
        if (match.groups?.content !== undefined && match.index !== undefined) {
            const blockStartIndex = match.index;
            const content = match.groups.content;

            // Find the line number where the code block starts
            let blockStartLineIndex = -1;
            // Loop backwards safely
            for(let i = lineStartIndices.length - 1; i >= 0; i--) {
                // FIX 1: Add check for undefined before accessing
                const startIndex = lineStartIndices[i];
                if (startIndex !== undefined && startIndex <= blockStartIndex) {
                    blockStartLineIndex = i;
                    break;
                }
            }

            // If block started before the first line's index was recorded (unlikely but possible)
            // or if lineStartIndices was empty, blockStartLineIndex remains -1.
            if (blockStartLineIndex === -1) continue;

            // Search backwards from the line *before* the block starts
            let foundPath: string | null = null;
             // Loop backwards safely from the line before the block
            for (let i = blockStartLineIndex - 1; i >= 0; i--) {
                 // FIX 2: Add check for undefined before accessing and trimming
                 const currentLine = lines[i];
                 if (currentLine === undefined) {
                     // This shouldn't happen with i >= 0, but satisfies compiler
                     continue;
                 }
                 const line = currentLine.trim();
                if (!line) continue; // Skip empty lines

                const indicatorMatch = line.match(FILE_INDICATOR_LINE_REGEX);
                if (indicatorMatch?.groups?.path) {
                    foundPath = indicatorMatch.groups.path.trim();
                    // Check if this path has already been processed by explicit blocks
                    if (input.includes(`[Processed Block for ${foundPath}]`)) {
                         console.log(`  ⏭️ Skipping implicit block for ${foundPath}, already processed by explicit marker.`);
                         foundPath = null; // Don't use this path
                    }
                    break; // Found the most recent path indicator
                }
                 // Stop searching if we hit another code block or unrelated content
                 if (line.startsWith('```') || line.startsWith('/* START') || line.startsWith('<file')) {
                     break;
                 }

                // Optional: Add more heuristics? E.g., if line *only* contains a path?
                 const potentialPathMatch = line.match(POTENTIAL_PATH_REGEX);
                 if (!indicatorMatch && potentialPathMatch?.groups?.path && line === potentialPathMatch.groups.path) {
                     // Found a line consisting ONLY of a path - less certain, use if no indicator found
                     // Check if already processed
                     if (!input.includes(`[Processed Block for ${potentialPathMatch.groups.path}]`)) {
                          foundPath = potentialPathMatch.groups.path.trim();
                     }
                      // Don't break yet, prefer a clearer indicator line if one exists above this
                 }
            }

            if (foundPath) {
                if (filesToWrite.has(foundPath)) {
                     console.warn(`⚠️ [${formatName}] Overwriting previous definition for: ${foundPath}`);
                }
                filesToWrite.set(foundPath, { content, format: formatName });
                console.log(`  🔎 Found [${formatName}]: ${foundPath}`);
                 // Mark this block as processed conceptually (we don't modify input here further)
            } else {
                 // Only warn if the block wasn't likely part of an explicit block handled earlier
                 const textBefore = input.substring(Math.max(0, blockStartIndex - 100), blockStartIndex);
                 if (!textBefore.includes('[Processed Block for')) {
                    console.warn(`  ⚠️ [${formatName}] Found code block but no preceding file path indicator found.`);
                    // console.warn(`      Block content preview: ${content.substring(0, 50).replace(/\n/g,'\\n')}...`);
                 }
            }
        }
    }
}


// Define filesToWrite map and input variable in a scope accessible by main and helpers
let filesToWrite: Map<string, { content: string; format: string }>;
let input: string;


/** Main function */
async function main() {
    // Initialize filesToWrite inside main
    filesToWrite = new Map<string, { content: string; format: string }>();

    console.log("Waiting for LLM output via stdin... (Paste content + EOF: Ctrl+D Linux/macOS, Ctrl+Z Enter Windows)");

    // Assign to the outer 'input' variable so helpers can access the modified version
    input = await readStdin();

    if (!input?.trim()) {
        console.error("Error: No input received from stdin.");
        process.exit(1);
    }

    console.log("\nReceived input. Processing...");

    // --- Step 1: Process Explicit Comment Blocks ---
    console.log("\n--- Searching for /* START OF ... */ blocks ---");
    // Reassign input after processing to remove handled blocks
    input = extractExplicitBlocks(input, explicitCommentBlockRegex, "Comment Block", filesToWrite);

    // --- Step 2: Process Explicit Tag Blocks ---
    console.log("\n--- Searching for <file path=...> blocks ---");
    // Reassign input again
    input = extractExplicitBlocks(input, explicitTagBlockRegex, "Tag Block", filesToWrite);

    // --- Step 3: Process Implicit Path + Code Blocks ---
    // This operates on the remaining input (where explicit blocks were removed/replaced)
    console.log("\n--- Searching for implicit [Path Line] + ```code``` blocks ---");
    extractImplicitBlocks(input, filesToWrite); // Pass the potentially modified input


    // --- Step 4: Write files ---
    console.log("\n--- Writing files ---");
    let filesProcessed = 0;
    let errors = 0;

    if (filesToWrite.size === 0) {
        console.warn("⚠️ No file blocks were successfully identified in the input.");
        // Optional: Check for common mistakes
        if (input.includes("```") && !input.match(fencedCodeBlockRegex)) {
            console.warn("   Hint: Found triple backticks ``` but maybe they aren't on their own lines or are formatted incorrectly?");
        }
         if (input.includes("START OF") && !input.match(explicitCommentBlockRegex)) {
             console.warn("   Hint: Found 'START OF' but maybe the comment syntax /* */ or spacing is incorrect?");
        }
         if (input.includes("<file") && !input.match(explicitTagBlockRegex)) {
             console.warn("   Hint: Found '<file' but maybe the tag format or attributes are incorrect?");
        }
        process.exit(0);
    }

    for (const [relativePath, fileData] of filesToWrite.entries()) {
        const absolutePath = path.resolve(process.cwd(), relativePath);
        console.log(`\nProcessing ${relativePath} (Detected via: ${fileData.format})`);
        try {
            await ensureDirectoryExists(absolutePath);
            await fs.writeFile(absolutePath, fileData.content, 'utf8');
            console.log(`✅ Successfully wrote ${relativePath}`);
            filesProcessed++;
        } catch (error) {
            console.error(`❌ Error writing file ${relativePath}:`, error);
            errors++;
            // Decide if you want to stop on error or continue
            // process.exit(1); // Uncomment to stop on first error
        }
    }

    console.log("\n--- Summary ---");
    if (filesProcessed > 0) {
        console.log(`✅ Wrote ${filesProcessed} file(s).`);
    }
    if (errors > 0) {
        console.error(`❌ Encountered errors writing ${errors} file(s).`);
        process.exit(1); // Exit with error code if files failed to write
    } else if (filesProcessed === 0) {
        console.warn("🏁 Finished, but no files were ultimately written (though some might have been detected). Check logs.");
    } else {
        console.log("🏁 Finished successfully.");
    }
}

// Execute main
main().catch((error) => {
    console.error("\nAn unexpected error occurred:", error);
    process.exit(1);
});
