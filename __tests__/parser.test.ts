import * as fsPromises from 'fs/promises'; // Renamed to avoid conflict
import * as fsSync from 'node:fs'; // For readdirSync
import * as path from 'path';
import OpenAI from 'openai'; // For spying on the OpenAI client
import type { FilesMap, FileData } from '../src/parser'; // Import the types

// Import the actual functions from the module
import * as parser from '../src/parser';

// --- Configuration ---
jest.setTimeout(60000); // 60 seconds per test

// --- Helper Functions ---
const readFixture = (fixtureName: string): Promise<string> => {
  const fixturePath = path.join(__dirname, 'fixtures', fixtureName);
  return fsPromises.readFile(fixturePath, 'utf-8');
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

// --- Test Suite for extractAllCodeBlocks (existing tests with determineFilePath mocked) ---
describe('extractAllCodeBlocks (Mocked LLM - Returning Map)', () => {
  let determineFilePathSpy: jest.SpyInstance;

  beforeEach(() => {
    // This spy mocks the entire determineFilePath function for this suite
    determineFilePathSpy = jest.spyOn(parser, 'determineFilePath');
    determineFilePathSpy.mockResolvedValue('DEFAULT_MOCKED_PATH');
  });

  afterEach(() => {
    determineFilePathSpy.mockRestore();
  });

  it('Fixture: markdown_backticks_in_code.md', async () => {
    const input = await readFixture('markdown_backticks_in_code.md');
    const expectedMarkdownBlockCount = 5; 

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(expectedMarkdownBlockCount);

    const lastBlockData = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(lastBlockData).toBeDefined();
    expect(lastBlockData!.content).toContain('Just the start fence'); 
    expect(lastBlockData!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_double_comments.md', async () => {
    const input = await readFixture('markdown_double_comments.md');
    const expectedMarkdownBlockCount = 2;

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(expectedMarkdownBlockCount);

    const lastBlockData = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(lastBlockData).toBeDefined();
    expect(lastBlockData!.content).toContain('body {'); 
    expect(lastBlockData!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_first_line_comment_path.md', async () => {
    const input = await readFixture('markdown_first_line_comment_path.md');
    const expectedNumberOfMarkdownBlocks = 5; 

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(expectedNumberOfMarkdownBlocks);

    const lastBlockInMap = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(lastBlockInMap).toBeDefined();
    expect(lastBlockInMap!.content).toContain('`DELETE /api/session`');
    expect(lastBlockInMap!.content).toContain('<!-- path: api/sessionHandler.ts -->');
    expect(lastBlockInMap!.format).toContain('markdown code block');
    
    expect(input).toContain('<!-- path: src/config.js -->');
    expect(input).toContain('const config = {};');

    expect(
      findEntryByContentSubstring(filesToWrite, '../../etc/passwd')
    ).toBeUndefined();
  });

  it('Fixture: markdown_front_matter_path.md', async () => {
    const input = await readFixture('markdown_front_matter_path.md');
    const expectedCodeSubstring = 'better-sqlite3';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_header_comment_path.md', async () => {
    const input = await readFixture('markdown_header_comment_path.md');
    const expectedCodeSubstring = '@jest/globals';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_heading_path.md', async () => {
    const input = await readFixture('markdown_heading_path.md');
    const expectedCodeSubstring = 'background-color';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_list_item_invalid_path.md', async () => {
    const input = await readFixture('markdown_list_item_invalid_path.md');
    const validSubstring = 'ValidComponent';
    
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1); 
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(validSubstring);
    expect(entry!.format).toContain('markdown code block');

    expect(findEntryByContentSubstring(filesToWrite, 'Skipped code 1')).toBeUndefined();
    expect(findEntryByContentSubstring(filesToWrite, 'Skipped content 2')).toBeUndefined();
  });

  it('Fixture: markdown_paragraph_path.md', async () => {
    const input = await readFixture('markdown_paragraph_path.md');
    const expectedCodeSubstring = 'Hello World!';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_real_life_1.md', async () => {
    const input = await readFixture('markdown_real_life_1.md');
    // This fixture has one <file> block (vite.config.ts) and one markdown block.
    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(2); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1); 

    const fileTagEntry = filesToWrite.get('vite.config.ts');
    expect(fileTagEntry).toBeDefined();
    expect(fileTagEntry!.content).toContain('export default config;');
    expect(fileTagEntry!.format).toContain('explicit <file> tag');

    const markdownEntry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(markdownEntry).toBeDefined();
    expect(markdownEntry!.content).toContain('This is a markdown code block');
    expect(markdownEntry!.format).toContain('markdown code block');
  });

  it('Fixture: markdown_standalone_path.md', async () => {
    const input = await readFixture('markdown_standalone_path.md');
    const expectedCodeSubstring = 'if __name__ == "__main__":';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: mixed_blocks.md', async () => {
    const input = await readFixture('mixed_blocks.md');
    const expectedCodeSubstringMarkdown = 'node dist/index.js';

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(3);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(2);

    const fileTagEntry = filesToWrite.get('config/settings.yaml');
    expect(fileTagEntry).toBeDefined();
    expect(fileTagEntry!.content).toContain('START OF config/settings.yaml');
    expect(fileTagEntry!.format).toContain('explicit <file> tag');
    
    const defaultPathEntry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(defaultPathEntry).toBeDefined();
    const isDefaultPathMarkdown = defaultPathEntry!.content.includes(expectedCodeSubstringMarkdown);
    const isDefaultPathCustomComment = defaultPathEntry!.content.includes('# Project Docs');
    expect(isDefaultPathMarkdown || isDefaultPathCustomComment).toBe(true); 
    
    if (isDefaultPathMarkdown) {
        expect(defaultPathEntry!.format).toContain('markdown code block');
    } else if (isDefaultPathCustomComment) {
        expect(defaultPathEntry!.format).toContain('custom comment');
    }
  });

  it('Fixture: no_path.md', async () => {
    const input = await readFixture('no_path.md');
    const expectedCodeSubstring = 'Some plain text content';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
  });

  it('Fixture: path_normalization.md', async () => {
    const input = await readFixture('path_normalization.md');
    const expectedCodeSubstring = 'export const helper';
    const filesToWrite = await parser.extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).toHaveBeenCalledTimes(1);
    const entry = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain(expectedCodeSubstring);
    expect(entry!.format).toContain('markdown code block');
    expect(entry!.path).not.toContain('\\'); 
  });

  it('Fixture: markdown_file_tags.md', async () => {
    const input = await readFixture('markdown_file_tags.md');
    const expectedFilePath = 'packages/skip/this.ts';
    const expectedCodeSubstring = 'console.log("Skipped")';

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1);
    expect(determineFilePathSpy).not.toHaveBeenCalled();

    const entry = filesToWrite.get(expectedFilePath); 
    expect(entry).toBeDefined();
    if (entry) {
      expect(entry.format).toContain('explicit <file> tag');
      expect(entry.content).toContain(expectedCodeSubstring);
      expect(entry.content).not.toContain('<file path=');
      expect(entry.content).not.toContain('</file');
    }
  });

  it('Fixture: markdown_double_wrapper_fences.md', async () => {
    const input = await readFixture('markdown_double_wrapper_fences.md');
    const expectedMarkdownBlockCount = 5; 

    const filesToWrite = await parser.extractAllCodeBlocks(input);

    expect(filesToWrite.size).toBe(1); 
    expect(determineFilePathSpy).toHaveBeenCalledTimes(expectedMarkdownBlockCount);

    const lastBlockData = filesToWrite.get('DEFAULT_MOCKED_PATH');
    expect(lastBlockData).toBeDefined();
    expect(lastBlockData!.content).toContain('"doubly_wrapped_json"');
    expect(lastBlockData!.format).toContain('markdown code block');
  });
});

// --- Test Suite for determineFilePath with Folder Structure Hinting ---
describe('determineFilePath with Folder Structure Hint', () => {
  let openAICreateSpy: jest.SpyInstance;
  let readdirSyncSpy: jest.SpyInstance | undefined; 
  let findPackageRootSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let originalFolderHintMaxDepth: number;


  beforeEach(() => {
    jest.restoreAllMocks(); // Clean slate for mocks

    openAICreateSpy = jest.spyOn(OpenAI.Chat.Completions.prototype, 'create');
    openAICreateSpy.mockResolvedValue({
      choices: [{ message: { content: 'MOCKED_LLM_GENERATED_PATH' } }],
    } as any);

    findPackageRootSpy = jest.spyOn(parser, 'findPackageRoot');
    findPackageRootSpy.mockReturnValue('/test/project/root'); // Consistent root

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Temporarily store and override FOLDER_HINT_MAX_DEPTH if it's exported and mutable
    // For this test, we'll assume it's accessible for modification or use a default
    // if direct modification isn't possible. This is a simplification for the test.
    originalFolderHintMaxDepth = (parser as any).FOLDER_HINT_MAX_DEPTH || 3;
  });

  afterEach(() => {
    openAICreateSpy.mockRestore();
    if (readdirSyncSpy) {
      readdirSyncSpy.mockRestore();
      readdirSyncSpy = undefined;
    }
    findPackageRootSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // Restore FOLDER_HINT_MAX_DEPTH if it was changed
     ((parser as any).FOLDER_HINT_MAX_DEPTH) = originalFolderHintMaxDepth;
  });

  it('should include folder structure hint in the LLM prompt when hint is generated', async () => {
    const mockProjectRoot = '/test/project/root';
    ((parser as any).FOLDER_HINT_MAX_DEPTH) = 2; // Set for this test
    
    readdirSyncSpy = jest.spyOn(fsSync, 'readdirSync');
    readdirSyncSpy.mockImplementation((dirPath: fsSync.PathLike) => {
      const currentPath = dirPath.toString();
      if (currentPath === mockProjectRoot) {
        return [
          { name: 'src', isDirectory: () => true, isFile: () => false } as fsSync.Dirent,
          { name: 'package.json', isDirectory: () => false, isFile: () => true } as fsSync.Dirent,
        ];
      } else if (currentPath === path.join(mockProjectRoot, 'src')) {
        return [
          { name: 'myFile.ts', isDirectory: () => false, isFile: () => true } as fsSync.Dirent,
          { name: 'components', isDirectory: () => true, isFile: () => false } as fsSync.Dirent,
        ];
      } else if (currentPath === path.join(mockProjectRoot, 'src', 'components')) {
         // This level (depth 2) should not be reached if maxDepth is 1 for getFolderStructureHint call
         // but scanDir itself is called with currentDepth starting at 0 for root.
         // For FOLDER_HINT_MAX_DEPTH = 2 (meaning scanDir maxDepth = 2)
         // root (depth 0) -> src (depth 1) -> components (depth 2)
        return [
          { name: 'Button.tsx', isDirectory: () => false, isFile: () => true } as fsSync.Dirent,
        ];
      }
      return []; 
    });

    await parser.determineFilePath("console.log('test snippet');");

    expect(openAICreateSpy).toHaveBeenCalled();
    const createArgs = openAICreateSpy.mock.calls[0][0];
    const systemMessage = createArgs.messages.find( (m: any) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    const systemMessageString = Array.isArray(systemMessage!.content) ? systemMessage!.content.join(' ') : systemMessage!.content as string;
    
    expect(systemMessageString).toContain('Here is the current folder structure');
    // Based on scanDir logic and maxDepth = 2 (from FOLDER_HINT_MAX_DEPTH)
    // Root (depth 0), src (depth 1), components (depth 2)
    // Files under components (Button.tsx) will be at depth 3 from root of scanDir, but depth 2 from 'src'
    // scanDir(rootDir, maxDepth=2, currentDepth=0)
    //  scanDir(src, maxDepth=2, currentDepth=1)
    //   scanDir(components, maxDepth=2, currentDepth=2) -> Button.tsx
    const expectedHint = 
`Project folder structure (up to 2 levels deep):
/
|-- src/
|   |-- myFile.ts
|   \`-- components/
|       \`-- Button.tsx 
\`-- package.json
`; 
    // Normalize whitespace for robust comparison
    const normalize = (str: string) => str.replace(/\s+/g, ' ').replace(/(\r\n|\n|\r)/gm," ").trim();
    expect(normalize(systemMessageString)).toContain(normalize(expectedHint.substring(expectedHint.indexOf("Project folder structure"))));


    expect(systemMessageString).not.toContain('node_modules');
    expect(systemMessageString).not.toContain('.git');
  });

  it('should NOT include folder structure hint if getFolderStructureHint returns empty due to root error', async () => {
    readdirSyncSpy = jest.spyOn(fsSync, 'readdirSync');
    readdirSyncSpy.mockImplementation((dirPath: fsSync.PathLike) => {
        if (dirPath.toString() === '/test/project/root') {
            throw new Error('Simulated readdir error at root');
        }
        return [];
    });

    await parser.determineFilePath("console.log('another test snippet');");

    expect(openAICreateSpy).toHaveBeenCalled();
    const createArgs = openAICreateSpy.mock.calls[0][0];
    const systemMessage = createArgs.messages.find( (m: any) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    const systemMessageString = Array.isArray(systemMessage!.content) ? systemMessage!.content.join(' ') : systemMessage!.content as string;
    
    expect(systemMessageString).not.toContain('Here is the current folder structure');
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Error generating folder structure hint: Simulated readdir error at root'));
  });

   it('should respect FOLDER_HINT_MAX_DEPTH for folder hint (e.g., depth 0)', async () => {
    const mockProjectRoot = '/test/project/root';
    ((parser as any).FOLDER_HINT_MAX_DEPTH) = 0; // Set maxDepth to 0 for this test

    readdirSyncSpy = jest.spyOn(fsSync, 'readdirSync');
    readdirSyncSpy.mockImplementation((dirPath: fsSync.PathLike) => {
      const currentPath = dirPath.toString();
      if (currentPath === mockProjectRoot) { // Only this call should happen for maxDepth 0
        return [
          { name: 'src', isDirectory: () => true, isFile: () => false } as fsSync.Dirent,
          { name: 'package.json', isDirectory: () => false, isFile: () => true } as fsSync.Dirent,
        ];
      }
      // Should not be called for /test/project/root/src if maxDepth is 0 for getFolderStructureHint
      // (which means scanDir is called with maxDepth 0, so it only lists root entries)
      return []; 
    });

    await parser.determineFilePath("console.log('depth 0 test');");
    
    expect(openAICreateSpy).toHaveBeenCalled();
    const createArgs = openAICreateSpy.mock.calls[0][0];
    const systemMessage = createArgs.messages.find( (m: any) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    const systemMessageString = Array.isArray(systemMessage!.content) ? systemMessage!.content.join(' ') : systemMessage!.content as string;

    expect(systemMessageString).toContain('Project folder structure (up to 0 levels deep):');
    expect(systemMessageString).toContain('|-- src/');
    expect(systemMessageString).toContain('`-- package.json');
    expect(systemMessageString).not.toContain('myFile.ts'); // Should not be visible at depth 0
    expect(systemMessageString).not.toContain('components/');
  });
});
