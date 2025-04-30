#!/usr/bin/env node
// llm-apply-cli/src/index.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  extractExplicitBlocks,
  explicitCommentBlockRegex,
  explicitTagBlockRegex,
  type FilesMap,
  type FileData,
  extractMarkdownBlocksWithParser
} from './parser';

// Helper to read all of stdin
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

async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dirname = path.dirname(filePath);
  if (!dirname || dirname === '.' || dirname === '/') return;
  try {
    await fs.access(dirname);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(dirname, { recursive: true });
    } else {
      throw err;
    }
  }
}

async function runCli() {
  const filesToWrite: FilesMap = new Map();
  console.log('Waiting for input via stdin...');
  const originalInput = await readStdin();

  if (!originalInput.trim()) {
    console.error('Error: No input received.');
    process.exit(1);
  }

  // 1) Explicit comment blocks
  let remaining = extractExplicitBlocks(
    originalInput,
    explicitCommentBlockRegex,
    'Comment Block',
    filesToWrite
  );

  // 2) Explicit tag blocks
  remaining = extractExplicitBlocks(
    remaining,
    explicitTagBlockRegex,
    'Tag Block',
    filesToWrite
  );

  // 3) Markdown blocks → _now_ LLM-driven
  console.log('Parsing Markdown code blocks via LLM...');
  await extractMarkdownBlocksWithParser(remaining, filesToWrite);

  // 4) Write out files
  console.log('Writing files...');
  let written = 0,
      errors = 0;

  if (filesToWrite.size === 0) {
    console.warn('No files identified. Exiting.');
    process.exit(0);
  }

  for (const [relPath, { content, format }] of filesToWrite.entries()) {
    const normalized = path.normalize(relPath).replace(/\\/g, '/');

    if (
      normalized.startsWith('../') ||
      normalized.startsWith('/') ||
      path.isAbsolute(normalized)
    ) {
      console.error(`Unsafe path rejected: ${relPath}`);
      errors++;
      continue;
    }

    const abs = path.resolve(process.cwd(), normalized);
    try {
      await ensureDirectoryExists(abs);
      const toWrite =
        content.endsWith('\n') || content === '' ? content : content + '\n';
      await fs.writeFile(abs, toWrite, 'utf8');
      console.log(`Wrote ${normalized}  [${format}]`);
      written++;
    } catch (err) {
      console.error(`Error writing ${normalized}:`, err);
      errors++;
    }
  }

  console.log(`\nSummary: ${written} written, ${errors} errors.`);
  if (errors > 0) process.exit(1);
  process.exit(0);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
