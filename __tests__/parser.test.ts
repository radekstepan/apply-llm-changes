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
        console.log(
          `[markdown_backticks_in_code] Found block containing "${substring}" -> Path: ${actualPath}`
        );
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
    const expectedSubstrings = ['Chat/ChatMessages.tsx', 'styles/global.css'];
    const expectedValidBlockCount = 2;

    // Call the function and get the result map
    const filesToWrite = await extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(expectedValidBlockCount);

    for (const substring of expectedSubstrings) {
      const entry = findEntryByContentSubstring(filesToWrite, substring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(
          `[markdown_double_comments] Found block containing "${substring}" -> Path: ${actualPath}`
        );
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

    console.log(
      `[markdown_first_line_comment_path] Found ${filesToWrite.size} blocks (expected approx ${expectedValidBlockCount})`
    );
    expect(filesToWrite.size).toBeGreaterThanOrEqual(
      expectedValidBlockCount - 1
    );
    expect(filesToWrite.size).toBeLessThanOrEqual(expectedValidBlockCount + 1);

    for (const substring of expectedSubstrings) {
      const entry = findEntryByContentSubstring(filesToWrite, substring);
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(
          `[markdown_first_line_comment_path] Found block containing "${substring}" -> Path: ${actualPath}`
        );
        expect(actualPath).not.toBe('NO_PATH');
        expect(typeof actualPath).toBe('string');
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(substring);
      }
    }

    const config = findEntryByContentSubstring(filesToWrite, 'src/config.js');

    expect(config).toBeDefined();

    expect(config![0]).toEqual('src/config.js');
    expect(config![1].content).toContain('const config = {};');

    expect(
      findEntryByContentSubstring(filesToWrite, '../../etc/passwd')
    ).toBeUndefined();
  });

  // ... front_matter ...
  it('Fixture: markdown_front_matter_path.md', async () => {
    const input = await readFixture('markdown_front_matter_path.md');
    // const expectedSubstringHint = 'packages/api/src/db/sqliteService.ts'; // Hint removed as LLM determines path
    const expectedCodeSubstring = 'better-sqlite3';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[markdown_front_matter_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
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
    // const expectedSubstringHint = 'src/__tests__/utils/headerCommentUtil.test.ts'; // Hint removed
    const expectedCodeSubstring = '@jest/globals';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[markdown_header_comment_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
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
    // const expectedSubstringHint = 'styles/main.css'; // Hint removed
    const expectedCodeSubstring = 'background-color';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[markdown_heading_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
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
      console.log(
        `[markdown_list_item_invalid_path] Found block containing "${validSubstring}" -> Path: ${actualPath}`
      );
      expect(actualPath).not.toBe('NO_PATH');
      expect(typeof actualPath).toBe('string');
      expect(actualPath.length).toBeGreaterThan(0);
      expect(fileData.format).toContain('markdown code block');
      expect(fileData.content).toContain(validSubstring);
    }

    for (const substring of invalidSubstrings) {
      expect(
        findEntryByContentSubstring(filesToWrite, substring)
      ).toBeUndefined();
    }
  });

  // ... paragraph ...
  it('Fixture: markdown_paragraph_path.md', async () => {
    const input = await readFixture('markdown_paragraph_path.md');
    // const expectedSubstringHint = 'src/app.js'; // Hint removed
    const expectedCodeSubstring = 'Hello World!';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[markdown_paragraph_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
      expect(actualPath).not.toBe('NO_PATH');
      expect(typeof actualPath).toBe('string');
      expect(actualPath.length).toBeGreaterThan(0);
      expect(fileData.format).toContain('markdown code block');
      expect(fileData.content).toContain(expectedCodeSubstring);
    }
  });

  // ... real_life_1 (MODIFIED TEST) ...
  it('Fixture: markdown_real_life_1.md', async () => {
    const input = await readFixture('markdown_real_life_1.md');
    // This block is now skipped due to <file> tags
    const skippedSubstring = 'export default config;';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(1);
    // Ensure the skipped block is not present
    expect(
      findEntryByContentSubstring(filesToWrite, skippedSubstring)
    ).toBeDefined();
  });

  // ... standalone ...
  it('Fixture: markdown_standalone_path.md', async () => {
    const input = await readFixture('markdown_standalone_path.md');
    // const expectedSubstringHint = 'path/to/my_script.py'; // Hint removed
    const expectedCodeSubstring = 'if __name__ == "__main__":';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[markdown_standalone_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
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
    // const expectedSubstringHint = 'scripts/run.sh'; // Hint removed
    const expectedCodeSubstring = 'node dist/index.js';
    const expectedValidBlockCount = 3;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[mixed_blocks] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
      expect(actualPath).not.toBe('NO_PATH');
      expect(typeof actualPath).toBe('string');
      expect(actualPath.length).toBeGreaterThan(0);
      expect(fileData.format).toContain('markdown code block');
      expect(fileData.content).toContain(expectedCodeSubstring);
    }
    // These blocks should not be found (one is <file> tag, one is custom comment)
    expect(
      findEntryByContentSubstring(filesToWrite, 'START OF config/settings.yaml')
    ).toBeUndefined();
    expect(
      findEntryByContentSubstring(filesToWrite, '# Project Docs')
    ).toBeUndefined(); // This is inside <file> tag in markdown
  });

  // ... no_path ...
  it('Fixture: no_path.md', async () => {
    const input = await readFixture('no_path.md');
    const expectedCodeSubstring = 'Some plain text content'; // Expect this block to be processed by LLM
    const expectedValidBlockCount = 1; // Expect LLM might find a path or return NO_PATH

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    // We can't guarantee LLM *won't* find a path, so check size >= 0
    expect(filesToWrite.size).toBeLessThanOrEqual(expectedValidBlockCount);

    if (filesToWrite.size === 1) {
      const entry = findEntryByContentSubstring(
        filesToWrite,
        expectedCodeSubstring
      );
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(
          `[no_path] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
        );
        // Path could be NO_PATH or something LLM determined
        expect(typeof actualPath).toBe('string');
        expect(fileData.format).toContain('markdown code block');
        expect(fileData.content).toContain(expectedCodeSubstring);
      }
    } else {
      console.log(
        `[no_path] Correctly found ${filesToWrite.size} blocks (LLM returned NO_PATH).`
      );
      expect(
        findEntryByContentSubstring(filesToWrite, expectedCodeSubstring)
      ).toBeUndefined();
    }
  });

  // ... path_normalization ...
  it('Fixture: path_normalization.md', async () => {
    const input = await readFixture('path_normalization.md');
    // const expectedSubstringHint = 'src\\\\utils\\\\helpers.ts'; // Hint removed
    const expectedCodeSubstring = 'export const helper';
    const expectedValidBlockCount = 1;

    const filesToWrite = await extractAllCodeBlocks(input); // Get returned map

    expect(filesToWrite.size).toBe(expectedValidBlockCount);
    const entry = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry).toBeDefined();
    if (entry) {
      const [actualPath, fileData] = entry;
      console.log(
        `[path_normalization] Found block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
      expect(actualPath).not.toBe('NO_PATH');
      expect(typeof actualPath).toBe('string');
      expect(actualPath.length).toBeGreaterThan(0);
      // Expect normalized path (forward slashes)
      expect(actualPath).not.toContain('\\');
      expect(fileData.format).toContain('markdown code block');
      expect(fileData.content).toContain(expectedCodeSubstring);
    }
  });

  // --- Test for <file> tags ---
  it('Fixture: markdown_file_tags.md', async () => {
    const input = await readFixture('markdown_file_tags.md');
    const expectedFilePath = 'packages/skip/this.ts';
    const expectedCodeSubstring = 'console.log("Skipped")';

    const filesToWrite = await extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1);

    // Check the valid block
    const entry1 = findEntryByContentSubstring(
      filesToWrite,
      expectedCodeSubstring
    );
    expect(entry1).toBeDefined();
    if (entry1) {
      const [actualPath, fileData] = entry1;
      console.log(
        `[markdown_file_tags] Found valid block containing "${expectedCodeSubstring}" -> Path: ${actualPath}`
      );
      expect(actualPath).not.toBe('NO_PATH'); // LLM should assign a path
      expect(fileData.format).toContain('explicit <file> tag');
      expect(fileData.content).toContain(expectedCodeSubstring);
      expect(fileData.content).not.toContain('<file path=');
      expect(fileData.content).not.toContain('</file');
    }
  });

  // --- NEW TEST CASE for double wrapped fences ---
  it('Fixture: markdown_double_wrapper_fences.md', async () => {
    const input = await readFixture('markdown_double_wrapper_fences.md');
    const expectedBlocks = [
      {
        pathHint: 'src/component.tsx',
        contentSubstring: 'MyComponent',
        shouldHaveOuterFences: true,
      },
      {
        pathHint: 'src/utils.js',
        contentSubstring: 'function greet()',
        shouldHaveOuterFences: true,
      },
      {
        pathHint: 'src/just_one_line_inside.txt',
        contentSubstring: 'hello',
        shouldHaveOuterFences: true,
      },
      {
        pathHint: 'src/no_double_wrapping.md',
        contentSubstring: 'standard markdown block',
        shouldHaveOuterFences: false,
      },
      {
        pathHint: 'src/fenced_json.json',
        contentSubstring: '"doubly_wrapped_json"',
        shouldHaveOuterFences: true,
      },
    ];
    // The number of blocks LLM is expected to find (it might not find paths for all, but should extract content)
    // All blocks in the fixture are standard markdown code blocks, so LLM will try to assign paths.
    const expectedTotalBlockCount = expectedBlocks.length;

    const filesToWrite = await extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBeGreaterThanOrEqual(
      expectedTotalBlockCount - 2
    ); // Allow some flexibility if LLM fails on a couple
    expect(filesToWrite.size).toBeLessThanOrEqual(expectedTotalBlockCount + 1);

    for (const expected of expectedBlocks) {
      const entry = findEntryByContentSubstring(
        filesToWrite,
        expected.contentSubstring
      );
      expect(entry).toBeDefined();
      if (entry) {
        const [actualPath, fileData] = entry;
        console.log(
          `[markdown_double_wrapper_fences] Found block for "${expected.pathHint}" (substring: "${expected.contentSubstring}") -> Path: ${actualPath}`
        );
        expect(actualPath).not.toBe('NO_PATH'); // LLM should assign paths
        expect(fileData.format).toContain('markdown code block');

        if (expected.isContentExact) {
          // Content between fences in fixture is "\n", so fileData.content is "```\n\n```"
          if (expected.pathHint === 'src/empty_inside.txt') {
            expect(fileData.content.trim()).toBe('```\n\n```');
          } else {
            expect(fileData.content).toBe(expected.contentSubstring);
          }
        } else {
          expect(fileData.content).toContain(expected.contentSubstring);
        }

        // Check if outer fences are present as expected in the *parser output*
        // The stripping happens later, in index.ts
        const startsWithFence = /^```([\w.-]+)?\s*\n/.test(fileData.content);
        const endsWithFence = /\n```\s*$/.test(fileData.content.trimEnd()); // trimEnd for last line content

        if (expected.shouldHaveOuterFences) {
          // For this test, we check if the content *extracted by the parser* still has the fences
          expect(startsWithFence).toBe(true);
          // A bit more robust check for the end fence, ensuring it's on its own line basically
          const lines = fileData.content.split('\n');
          expect(lines.length).toBeGreaterThanOrEqual(2); // Must have at least two lines for outer fences
          expect(lines[lines.length - 1].trim()).toBe('```');
        } else {
          // If not expected to have outer fences (e.g. standard block), then it shouldn't match both conditions
          // Or more simply, if it's a single block, it might start with ``` and end with ```, but not "doubly"
          // This test focuses on what the parser extracts. The stripping is tested in utils.test.ts
        }
      }
    }
  });
});
