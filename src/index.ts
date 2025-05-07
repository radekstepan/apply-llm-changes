import * as fsPromises from 'fs/promises';
import fs from 'fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import { extractAllCodeBlocks } from './parser';
import type { FilesMap } from './parser';

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
    // Check for package.json or node_modules in the current directory
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, 'node_modules'))
    ) {
      return dir;
    }
    // Move up one level
    const parent = path.dirname(dir);
    // Stop if we've reached the filesystem root
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback if no indicator found
  return process.cwd();
}

// Check for .env in the current working directory first, then fallback to package root
let envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  const packageRoot = findPackageRoot(__dirname);
  envPath = path.join(packageRoot, '.env');
}
console.log(`Loading environment from: ${envPath}`);
dotenv.config({ path: envPath });

/**
 * Reads all data piped into standard input.
 * @returns A promise that resolves with the complete string content from stdin.
 */
async function readStdin(): Promise<string> {
  console.log('Reading from stdin...');
  let data = '';
  process.stdin.setEncoding('utf8');
  try {
    for await (const chunk of process.stdin) {
      data += chunk;
    }
  } catch (error: any) {
    console.error('Error reading from stdin:', error);
    throw error; // Re-throw to be handled by the main execution block
  }
  console.log(`Finished reading stdin (total length ${data.length}).`);
  return data;
}

/**
 * Main command-line interface execution function.
 * Reads input, parses code blocks, and writes files.
 */
async function runCli() {
  console.log('Waiting for LLM output via stdin...');
  let originalInput: string;
  try {
    originalInput = (await readStdin()).trim();
  } catch (readError) {
    console.error('Failed to read input from stdin. Exiting.', readError);
    process.exit(1);
  }

  if (!originalInput) {
    console.error('Error: No input received from stdin.');
    process.exit(1);
  }

  console.log('Input received. Starting code block extraction...');
  let filesToWrite: FilesMap;
  try {
    // Parse the input to extract file paths and code content
    filesToWrite = await extractAllCodeBlocks(originalInput);
    console.log('Code block extraction finished.');
  } catch (parseError: any) {
    console.error(
      'Error during code block extraction:',
      parseError.message || parseError
    );
    process.exit(1);
  }

  if (filesToWrite.size === 0) {
    console.warn('No valid code blocks with file paths found. Exiting.');
    process.exit(0);
  }

  console.log(
    `\nFound ${filesToWrite.size} files to write. Proceeding with file operations...`
  );

  let written = 0;
  let errors = 0;
  const writePromises: Promise<boolean>[] = [];

  // Iterate through the map of files to write
  for (const [relPath, { content }] of filesToWrite.entries()) {
    // Security check: Ensure path is relative and doesn't try to escape cwd
    if (path.isAbsolute(relPath) || relPath.startsWith('..')) {
      console.error(`Error: Skipping potentially unsafe path "${relPath}"`);
      errors++;
      continue;
    }

    const dest = path.resolve(process.cwd(), relPath); // Create absolute path safely within cwd

    // Create a promise for each file writing operation
    const writePromise = (async (): Promise<boolean> => {
      try {
        // Ensure the target directory exists
        await fsPromises.mkdir(path.dirname(dest), { recursive: true });
        // Ensure content ends with a newline for POSIX compatibility
        const contentToWrite = content.endsWith('\n')
          ? content
          : content + '\n';
        await fsPromises.writeFile(dest, contentToWrite, 'utf8');
        console.log(`Wrote ${relPath}`);
        return true; // Indicate success
      } catch (e: any) {
        console.error(`Error writing ${relPath}:`, e.message || e);
        return false; // Indicate failure
      }
    })();
    writePromises.push(writePromise);
  }

  // Wait for all file write operations to complete
  const results = await Promise.all(writePromises);

  // Count successes and failures
  written = results.filter((success) => success).length;
  errors += results.filter((success) => !success).length; // Add file writing errors to other errors

  console.log(`\nSummary: Wrote ${written}, Skipped/Errors ${errors}`);

  // Exit with error code if any errors occurred
  if (errors > 0) {
    process.exit(1);
  }
}

// Execute the CLI function if the script is run directly
if (require.main === module) {
  runCli().catch((e) => {
    console.error('Unexpected error in CLI:', e);
    process.exit(1);
  });
}
