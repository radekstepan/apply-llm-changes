// File: src/index.ts
import * as fsPromises from 'fs/promises';
import fs from 'fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import { extractAllCodeBlocks } from './parser';
import type { FilesMap } from './parser';

// findPackageRoot function remains the same...
/**
 * Walks up from startDir until it finds package.json or node_modules,
 * falling back to process.cwd() if none.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, 'node_modules'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const packageRoot = findPackageRoot(__dirname);
dotenv.config({ path: path.join(packageRoot, '.env') });


/** Reads all data from stdin. */
async function readStdin(): Promise<string> {
  console.log("Reading from stdin..."); // Log start
  let data = '';
  process.stdin.setEncoding('utf8');
  try {
      for await (const chunk of process.stdin) {
        data += chunk;
        // console.log(`Read chunk (length ${chunk.length})`); // Uncomment for very verbose logging
      }
  } catch (error: any) {
       console.error("Error reading from stdin:", error);
       throw error; // Rethrow to be caught by runCli's catch
  }
  console.log(`Finished reading stdin (total length ${data.length}).`); // Log end
  return data;
}

async function runCli() {
  console.log('Waiting for LLM output via stdin...');
  let originalInput: string;
  try {
      originalInput = (await readStdin()).trim();
  } catch (readError) {
      console.error("Failed to read input from stdin. Exiting.", readError);
      process.exit(1);
  }

  if (!originalInput) {
    console.error('Error: No input received from stdin');
    process.exit(1);
  }

  console.log('Input received. Starting code block extraction...');
  let filesToWrite: FilesMap;
  try {
    // Call extractAllCodeBlocks and receive the map
    filesToWrite = await extractAllCodeBlocks(originalInput);
    console.log('Code block extraction finished.');
  } catch (parseError: any) {
     console.error("Error during code block extraction:", parseError.message || parseError);
     process.exit(1);
  }


  if (filesToWrite.size === 0) {
    console.warn('No valid code blocks with file paths found. Exiting.');
    process.exit(0);
  }

  console.log(`\nFound ${filesToWrite.size} files to write. Proceeding with file operations...`);

  let written = 0, errors = 0;
  // Use Promise.all for potentially faster parallel file writing
  const writePromises = [];
  for (const [relPath, { content }] of filesToWrite.entries()) {
    if (path.isAbsolute(relPath) || relPath.startsWith('..')) {
        console.error(`Error: Skipping potentially unsafe path "${relPath}"`);
        errors++;
        continue;
    }
    const dest = path.resolve(process.cwd(), relPath);
    const writePromise = (async () => { // Wrap file writing in an async IIFE
        try {
            await fsPromises.mkdir(path.dirname(dest), { recursive: true });
            const contentToWrite = content.endsWith('\n') ? content : content + '\n';
            await fsPromises.writeFile(dest, contentToWrite, 'utf8');
            console.log(`Wrote ${relPath}`);
            // Safely increment written count - no race conditions for simple counters here
            // written++; // This might cause race conditions if not careful - better to count successes later
            return true; // Indicate success
        } catch (e: any) {
            console.error(`Error writing ${relPath}:`, e.message || e);
            // errors++; // Better to count failures later
            return false; // Indicate failure
        }
    })();
    writePromises.push(writePromise);
  }

  // Wait for all file operations to complete
  const results = await Promise.all(writePromises);
  written = results.filter(success => success).length;
  errors += results.filter(success => !success).length; // Add file writing errors


  console.log(`\nSummary: Wrote ${written}, Skipped/Errors ${errors}`);
  if (errors > 0) process.exit(1);
}

if (require.main === module) {
  runCli().catch(e => {
    console.error('Unexpected error in CLI:', e);
    process.exit(1);
  });
}
