// File: src/index.ts
import * as fsPromises from 'fs/promises';
import fs from 'fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
// Import the specific functions needed
import { extractAllCodeBlocks } from './parser';
import type { FilesMap } from './parser'; // Import type if needed elsewhere

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

// Load the .env from the package root
const packageRoot = findPackageRoot(__dirname);
dotenv.config({ path: path.join(packageRoot, '.env') });


/** Reads all data from stdin. */
async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

async function runCli() {
  console.log('Waiting for LLM output via stdin...');
  const originalInput = (await readStdin()).trim();
  if (!originalInput) {
    console.error('Error: No input received from stdin');
    process.exit(1);
  }

  // Call extractAllCodeBlocks and receive the map
  const filesToWrite: FilesMap = await extractAllCodeBlocks(originalInput);

  if (filesToWrite.size === 0) {
    console.warn('No valid code blocks with file paths found. Exiting.');
    process.exit(0);
  }

  console.log(`\nFound ${filesToWrite.size} files to write.`);

  let written = 0, errors = 0;
  for (const [relPath, { content }] of filesToWrite.entries()) {
    // Add extra validation for safety
    if (path.isAbsolute(relPath) || relPath.startsWith('..')) {
        console.error(`Error: Skipping potentially unsafe path "${relPath}"`);
        errors++;
        continue;
    }
    const dest = path.resolve(process.cwd(), relPath);
    try {
      await fsPromises.mkdir(path.dirname(dest), { recursive: true });
      // Ensure content ends with a newline for POSIX compatibility
      const contentToWrite = content.endsWith('\n') ? content : content + '\n';
      await fsPromises.writeFile(dest, contentToWrite, 'utf8');
      console.log(`Wrote ${relPath}`);
      written++;
    } catch (e: any) {
      console.error(`Error writing ${relPath}:`, e.message || e);
      errors++;
    }
  }

  console.log(`\nSummary: Wrote ${written}, Skipped/Errors ${errors}`);
  if (errors > 0) process.exit(1);
}

if (require.main === module) {
  runCli().catch(e => {
    console.error('Unexpected error in CLI:', e);
    process.exit(1);
  });
}
