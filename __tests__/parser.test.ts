import * as fs from 'fs/promises';
import * as path from 'path';
import type { FilesMap, FileData } from '../src/parser'; // Import the types

// Import the actual functions from the module
import { extractAllCodeBlocks, determineFilePath } from '../src/parser';

// --- Configuration ---
jest.setTimeout(60000); // 60 seconds per test

// --- Helper Functions ---
const readFixture = (fixtureName: string): Promise<string> => {
  const fixturePath = path.join(__dirname, 'fixtures', fixtureName);
  return fs.readFile(fixturePath, 'utf-8');
};

const findEntryByContentSubstring = (
    map: FilesMap,
    substring: string
): [string, FileData] | undefined => {
    for (const entry of map.entries()) {
        // Check the raw content for the substring
        if (entry[1].content.includes(substring)) {
            return entry;
        }
    }
    return undefined;
};

// --- Test Suite ---
describe('extractAllCodeBlocks (Integration with Real LLM - Returning Map)', () => {
  // No longer need beforeEach to reset an external map

  it('Fixture: markdown_backticks_in_code.md', async () => {
    const input = await readFixture('markdown_backticks_in_code.md');
    const expectedSubstrings = [
      'function cleanInput(input)',
      '.extra-class {',
      'key: value',
      'echo "Combo"',
      'Just the start fence',
    ];
    const expectedValidBlockCount = 5;

    // Call the function and get the result map
    const filesToWrite = await extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(expectedValidBlockCount);

    for (const substring of expectedSubstrings) {
      const entry = findEntryByContentSubstring(filesToWrite, substring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_backticks_in_code] Found block containing "${substring}" -> Path: ${actualPath}`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(substring);
      }
    }
  });

  // --- Add similar modifications for ALL other test cases ---
  // Example for one more test case:

  it('Fixture: markdown_double_comments.md', async () => {
    const input = await readFixture('markdown_double_comments.md');
    const expectedSubstrings = [
        'Chat/ChatMessages.tsx',
        'styles/global.css',
    ];
    const expectedValidBlockCount = 2;

    // Call the function and get the result map
    const filesToWrite = await extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(expectedValidBlockCount);

    for (const substring of expectedSubstrings) {
      const entry = findEntryByContentSubstring(filesToWrite, substring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_double_comments] Found block containing "${substring}" -> Path: ${actualPath}`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(substring);
      }
    }
  });

  // ... repeat the pattern for markdown_first_line_comment_path.md ...
  it('Fixture: markdown_first_line_comment_path.md', async () => {
      const input = await readFixture('markdown_first_line_comment_path.md');
      const expectedSubstrings = [
          'dockerManager.ts',
          'process_data.py',
          'styles/layout.css',
          'Transcription/Transcription.tsx',
          'api/sessionHandler.ts',
      ];
      const expectedValidBlockCount = 5;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      console.log(`[markdown_first_line_comment_path] Found ${filesToWrite.size} blocks (expected approx ${expectedValidBlockCount})`);
      expect(filesToWrite.size).toBeGreaterThanOrEqual(expectedValidBlockCount -1);
      expect(filesToWrite.size).toBeLessThanOrEqual(expectedValidBlockCount + 1);

      for (const substring of expectedSubstrings) {
        const entry = findEntryByContentSubstring(filesToWrite, substring);
        expect(entry).toBeDefined();
        if (entry) {
          const [actualPath, fileData] = entry;
          console.log(`[markdown_first_line_comment_path] Found block containing "${substring}" -> Path: ${actualPath}`);
          expect(actualPath).not.toBe('NO_PATH');
          expect(typeof actualPath).toBe('string');
          expect(fileData.format).toContain('markdown code block');
          expect(fileData.content).toContain(substring);
        }
      }
      expect(findEntryByContentSubstring(filesToWrite, 'src/config.js')).toBeUndefined();
      expect(findEntryByContentSubstring(filesToWrite, '../../etc/passwd')).toBeUndefined();
    });


  // ... front_matter ...
   it('Fixture: markdown_front_matter_path.md', async () => {
      const input = await readFixture('markdown_front_matter_path.md');
      const expectedSubstringHint = 'sqliteService.ts';
      const expectedCodeSubstring = 'better-sqlite3';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_front_matter_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });

  // ... header_comment ...
  it('Fixture: markdown_header_comment_path.md', async () => {
      const input = await readFixture('markdown_header_comment_path.md');
      const expectedSubstringHint = 'headerCommentUtil.test.ts';
      const expectedCodeSubstring = '@jest/globals';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
       expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_header_comment_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });

  // ... heading ...
  it('Fixture: markdown_heading_path.md', async () => {
      const input = await readFixture('markdown_heading_path.md');
      const expectedSubstringHint = 'styles/main.css';
      const expectedCodeSubstring = 'background-color';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
      expect(entry).toBeDefined();
       if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_heading_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });


  // ... list_item_invalid ...
  it('Fixture: markdown_list_item_invalid_path.md', async () => {
      const input = await readFixture('markdown_list_item_invalid_path.md');
      const validSubstring = 'ValidComponent';
      const invalidSubstrings = [
          'Skipped code 1',
          'Skipped content 2',
          'block has no path',
      ];
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);

      const entry = findEntryByContentSubstring(filesToWrite, validSubstring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_list_item_invalid_path] Found block containing "${validSubstring}" -> Path: ${actualPath} (Hint was: src/valid-component.jsx)`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(validSubstring);
      }

      for (const substring of invalidSubstrings) {
          expect(findEntryByContentSubstring(filesToWrite, substring)).toBeUndefined();
      }
    });


  // ... paragraph ...
  it('Fixture: markdown_paragraph_path.md', async () => {
      const input = await readFixture('markdown_paragraph_path.md');
      const expectedSubstringHint = 'src/app.js';
      const expectedCodeSubstring = 'Hello World!';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
      expect(entry).toBeDefined();
       if (entry) {
        const [actualPath, fileData] = entry;
        console.log(`[markdown_paragraph_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(actualPath.length).toBeGreaterThan(0);
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });


  // ... real_life_1 ...
  it('Fixture: markdown_real_life_1.md', async () => {
      const input = await readFixture('markdown_real_life_1.md');
      const expectedSubstringHint = 'packages/api/src/config/index.ts';
      const expectedCodeSubstring = 'export default config;';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
      expect(entry).toBeDefined();
      if (entry) {
          const [actualPath, fileData] = entry;
          console.log(`[markdown_real_life_1] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
          expect(actualPath).not.toBe('NO_PATH');
          expect(typeof actualPath).toBe('string');
          expect(actualPath.length).toBeGreaterThan(0);
          expect(fileData.format).toContain('markdown code block');
          expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });

  // ... standalone ...
  it('Fixture: markdown_standalone_path.md', async () => {
      const input = await readFixture('markdown_standalone_path.md');
      const expectedSubstringHint = 'path/to/my_script.py';
      const expectedCodeSubstring = 'if __name__ == "__main__":';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
       expect(entry).toBeDefined();
      if (entry) {
          const [actualPath, fileData] = entry;
          console.log(`[markdown_standalone_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
          expect(actualPath).not.toBe('NO_PATH');
          expect(typeof actualPath).toBe('string');
          expect(actualPath.length).toBeGreaterThan(0);
          expect(fileData.format).toContain('markdown code block');
          expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });

  // ... mixed ...
   it('Fixture: mixed_blocks.md', async () => {
      const input = await readFixture('mixed_blocks.md');
      const expectedSubstringHint = 'scripts/run.sh';
      const expectedCodeSubstring = 'node dist/index.js';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
      expect(entry).toBeDefined();
      if (entry) {
          const [actualPath, fileData] = entry;
          console.log(`[mixed_blocks] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
          expect(actualPath).not.toBe('NO_PATH');
          expect(typeof actualPath).toBe('string');
          expect(actualPath.length).toBeGreaterThan(0);
          expect(fileData.format).toContain('markdown code block');
          expect(fileData.content).toContain(expectedCodeSubstring);
      }
      expect(findEntryByContentSubstring(filesToWrite, 'START OF config/settings.yaml')).toBeUndefined();
      expect(findEntryByContentSubstring(filesToWrite, '# Project Docs')).toBeUndefined();
    });

  // ... no_path ...
   it('Fixture: no_path.md', async () => {
      const input = await readFixture('no_path.md');
      const expectedValidBlockCount = 0;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      console.log(`[no_path] Correctly found ${filesToWrite.size} blocks.`);
    });

  // ... path_normalization ...
  it('Fixture: path_normalization.md', async () => {
      const input = await readFixture('path_normalization.md');
      const expectedSubstringHint = 'src\\\\utils\\\\helpers.ts';
      const expectedCodeSubstring = 'export const helper';
      const expectedValidBlockCount = 1;

      const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

      expect(filesToWrite.size).toBe(expectedValidBlockCount);
      const entry = findEntryByContentSubstring(filesToWrite, expectedCodeSubstring);
       expect(entry).toBeDefined();
      if (entry) {
          const [actualPath, fileData] = entry;
          console.log(`[path_normalization] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath} (Hint was: ${expectedSubstringHint})`);
          expect(actualPath).not.toBe('NO_PATH');
          expect(typeof actualPath).toBe('string');
          expect(actualPath.length).toBeGreaterThan(0);
          expect(fileData.format).toContain('markdown code block');
          expect(fileData.content).toContain(expectedCodeSubstring);
      }
    });
});
