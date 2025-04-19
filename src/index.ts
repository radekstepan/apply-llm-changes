#!/usr/bin/env node
// Shebang required for CLI execution

// llm-apply-cli/src/index.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import {
    extractExplicitBlocks,
    extractMarkdownBlocksWithPeg,
    explicitCommentBlockRegex,
    explicitTagBlockRegex,
    type FilesMap,
    type FileData
} from './parser';

// Helper Functions

/** Reads all data from standard input */
async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', () => { let chunk; while ((chunk = process.stdin.read()) !== null) { data += chunk; } });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

/** Creates directories recursively if they don’t exist */
async function ensureDirectoryExists(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!dirname || dirname === '.' || dirname === '/') return;
    try {
        await fs.access(dirname);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(dirname, { recursive: true });
                console.log(`Created directory: ${dirname}`);
            } catch (mkdirError: any) {
                if (mkdirError.code !== 'EEXIST') {
                    console.error(`Error creating directory ${dirname}:`, mkdirError);
                    throw mkdirError;
                }
            }
        } else {
            console.error(`Error accessing directory ${dirname}:`, error);
            throw error;
        }
    }
}

// Main Execution Logic
async function runCli() {
    const filesToWrite: FilesMap = new Map();

    console.log("Waiting for LLM output via stdin... (Paste content + EOF: Ctrl+D on Linux/macOS, Ctrl+Z then Enter on Windows)");
    const originalInput = await readStdin();

    if (!originalInput?.trim()) {
        console.error("Error: No input received from stdin");
        process.exit(1);
    }
    console.log("\nProcessing input...");
    let processedInput = originalInput;

    // Step 1 & 2: Extract Explicit Blocks
    console.log("\nSearching for /* START OF ... */ blocks...");
    processedInput = extractExplicitBlocks(processedInput, explicitCommentBlockRegex, "Comment Block", filesToWrite);
    console.log("\nSearching for <file path=...> blocks...");
    processedInput = extractExplicitBlocks(processedInput, explicitTagBlockRegex, "Tag Block", filesToWrite);

    // Step 3: Parse Markdown Blocks
    console.log("\nParsing remaining text for Markdown code blocks...");
    extractMarkdownBlocksWithPeg(processedInput, filesToWrite);

    // Step 4: Write Files
    console.log("\nWriting files...");
    let filesProcessed = 0;
    let errors = 0;
    if (filesToWrite.size === 0) {
        console.warn("Warning: No file blocks identified in the input");
        if (originalInput.includes("```")) console.warn("Hint: Ensure a valid file path (e.g., path/to/file.ts) precedes each code block");
        if (originalInput.includes("START OF")) console.warn("Hint: Verify /* */ comment syntax and spacing");
        if (originalInput.includes("<file")) console.warn("Hint: Check <file path=\"...\"> tag format");
        process.exit(0);
    }

    for (const [relativePath, fileData] of filesToWrite.entries()) {
        let normalizedPath: string;
        try {
            normalizedPath = path.normalize(relativePath).replace(/\\/g, '/');
            if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath) || normalizedPath.startsWith('/')) {
                console.error(`Error: Unsafe or absolute path detected: ${relativePath}`);
                errors++;
                continue;
            }
        } catch (normError) {
            console.error(`Error: Invalid path format: ${relativePath}`, normError);
            errors++;
            continue;
        }

        const absolutePath = path.resolve(process.cwd(), normalizedPath);
        console.log(`\nProcessing ${normalizedPath} (Detected via: ${fileData.format})`);
        try {
            await ensureDirectoryExists(absolutePath);
            const contentToWrite = (fileData.content && !/\r?\n$/.test(fileData.content))
                ? fileData.content + '\n'
                : fileData.content ?? '';
            await fs.writeFile(absolutePath, contentToWrite, 'utf8');
            console.log(`Wrote ${normalizedPath} successfully`);
            filesProcessed++;
        } catch (error) {
            console.error(`Error writing file ${normalizedPath}:`, error);
            errors++;
        }
    }

    // Summary
    console.log("\nSummary:");
    if (filesProcessed > 0) console.log(`Wrote ${filesProcessed} file(s)`);
    if (errors > 0) {
        console.error(`Encountered ${errors} error(s). See logs for details`);
        process.exit(1);
    } else if (filesProcessed === 0 && filesToWrite.size > 0) {
        console.warn("Finished, but no files written due to errors");
        process.exit(1);
    } else if (filesProcessed === 0) {
        console.warn("Finished, but no files identified or written");
    } else {
        console.log("Finished successfully");
    }
}

// Entry Point
if (require.main === module && process.env.NODE_ENV !== 'test') {
    runCli().catch((error) => {
        console.error("\nUnexpected error during execution:", error);
        process.exit(1);
    });
}
