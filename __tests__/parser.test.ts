import * as fs from 'fs/promises';
import * as path from 'path';
import type { FilesMap, FileData } from '../src/parser';

// Set mock environment variables BEFORE parser.ts is imported and initializes its client
process.env.LLM_API_KEY = 'test_api_key';
process.env.LLM_API_BASE_URL = 'http://localhost:8080/v1'; // Mock URL

import {
  extractAllCodeBlocks,
  determineFilePath,
  client as openaiClient,
} from '../src/parser';

jest.setTimeout(60000);

const readFixture = (fixtureName: string): Promise<string> => {
  const fixturePath = path.join(__dirname, 'fixtures', fixtureName);
  return fs.readFile(fixturePath, 'utf-8');
};

const findEntryByContentSubstring = (
  map: FilesMap,
  substring: string
): [string, FileData] | undefined => {
  for (const entry of map.entries()) {
    if (entry[1].content.includes(substring)) {
      return entry;
    }
  }
  return undefined;
};

describe('extractAllCodeBlocks (Integration Tests with Controlled LLM)', () => {
  let integrationSpy: jest.SpyInstance | undefined;

  beforeAll(() => {
    if (openaiClient && openaiClient.chat && openaiClient.chat.completions) {
      integrationSpy = jest.spyOn(openaiClient.chat.completions, 'create');
      integrationSpy.mockResolvedValue({
        choices: [{ message: { content: 'NO_PATH' } }], // All LLM calls return NO_PATH
      });
    } else {
      console.warn(
        'Integration Test: OpenAI client not available for spying during beforeAll. This might affect extractAllCodeBlocks tests if LLM calls are made.'
      );
    }
  });

  afterAll(() => {
    if (integrationSpy) {
      integrationSpy.mockRestore();
    }
  });

  it('Fixture: markdown_backticks_in_code.md', async () => {
    const input = await readFixture('markdown_backticks_in_code.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    // All 5 blocks are standard markdown, will be NO_PATH by the integrationSpy
    expect(filesToWrite.size).toBe(0);
  });

  it('Fixture: markdown_double_comments.md', async () => {
    const input = await readFixture('markdown_double_comments.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // 2 standard blocks -> NO_PATH
  });

  it('Fixture: markdown_first_line_comment_path.md', async () => {
    const input = await readFixture('markdown_first_line_comment_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // All standard blocks -> NO_PATH
  });

  it('Fixture: markdown_front_matter_path.md', async () => {
    const input = await readFixture('markdown_front_matter_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: markdown_header_comment_path.md', async () => {
    const input = await readFixture('markdown_header_comment_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: markdown_heading_path.md', async () => {
    const input = await readFixture('markdown_heading_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: markdown_list_item_invalid_path.md', async () => {
    const input = await readFixture('markdown_list_item_invalid_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Valid block becomes NO_PATH
  });

  it('Fixture: markdown_paragraph_path.md', async () => {
    const input = await readFixture('markdown_paragraph_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: markdown_real_life_1.md', async () => {
    const input = await readFixture('markdown_real_life_1.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    // This fixture contains one <file> tag, which is processed directly.
    // And one markdown block which will become NO_PATH.
    expect(filesToWrite.size).toBe(1);
    expect(filesToWrite.has('helm/configs/tracking-prod.yaml')).toBe(true);
  });

  it('Fixture: markdown_standalone_path.md', async () => {
    const input = await readFixture('markdown_standalone_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: mixed_blocks.md', async () => {
    const input = await readFixture('mixed_blocks.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    // Contains <file> tags and markdown blocks. Markdown blocks will be NO_PATH.
    // Two <file> tags: "config/settings.prod.yaml", "docs/architecture.md"
    // One markdown block (run.sh) which will be NO_PATH.
    expect(filesToWrite.size).toBe(2);
    expect(filesToWrite.has('config/settings.prod.yaml')).toBe(true);
    expect(filesToWrite.has('docs/architecture.md')).toBe(true);
  });

  it('Fixture: no_path.md', async () => {
    const input = await readFixture('no_path.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    // Standard block, will be NO_PATH due to integrationSpy
    expect(filesToWrite.size).toBe(0);
  });

  it('Fixture: path_normalization.md', async () => {
    const input = await readFixture('path_normalization.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // Standard block -> NO_PATH
  });

  it('Fixture: markdown_file_tags.md', async () => {
    const input = await readFixture('markdown_file_tags.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    // Only one <file> tag block
    expect(filesToWrite.size).toBe(1);
    expect(filesToWrite.has('packages/skip/this.ts')).toBe(true);
  });

  it('Fixture: markdown_double_wrapper_fences.md', async () => {
    const input = await readFixture('markdown_double_wrapper_fences.md');
    const filesToWrite = await extractAllCodeBlocks(input);
    expect(filesToWrite.size).toBe(0); // All 5 standard blocks -> NO_PATH
  });
});

describe('determineFilePath - Prompt Modification (Unit Tests)', () => {
  let unitTestSpy: jest.SpyInstance | undefined;
  const originalSystemPrompt = [
    'You are an assistant that assigns the full relative file path to a code snippet.',
    'Analyze the snippet content and any surrounding context provided.',
    'Determine the most likely full relative file path (e.g., src/components/Button.tsx, packages/utils/src/helpers.js) based on common project structures, comments, or import statements within the snippet.',
    'Ensure the path is relative to a project root and uses forward slashes (/).',
    'Do not include absolute paths (e.g., /home/user/...) or URLs.',
    'If you cannot confidently determine a reasonable file path for the snippet, respond with exactly the string NO_PATH.',
    'Do not add any explanation, preamble, or markdown formatting to your response. Respond only with the path or NO_PATH.',
  ].join(' ');

  beforeEach(() => {
    if (!openaiClient || !openaiClient.chat || !openaiClient.chat.completions) {
      throw new Error(
        'OpenAI client not initialized as expected for unit tests.'
      );
    }
    unitTestSpy = jest.spyOn(openaiClient.chat.completions, 'create');
    unitTestSpy.mockResolvedValue({
      choices: [{ message: { content: 'src/mocked/path.ts' } }],
    });
  });

  afterEach(() => {
    if (unitTestSpy) {
      unitTestSpy.mockRestore();
    }
  });

  it('should include directory structure hint in LLM prompt when structure is provided', async () => {
    const snippet = 'const x = 10;';
    const directoryStructure = ['src/components', 'src/services', 'docs/api'];
    await determineFilePath(snippet, directoryStructure);

    expect(unitTestSpy).toHaveBeenCalledTimes(1);
    const messages = unitTestSpy?.mock.calls[0][0].messages;
    const systemMessageContent = messages.find(
      (m: any) => m.role === 'system'
    )?.content;

    const expectedHint = `Hint: The project has the following directory structure (use this to help determine the file path):\n- ${directoryStructure.join('\n- ')}`;
    expect(systemMessageContent).toContain(expectedHint);
    expect(systemMessageContent).toContain(originalSystemPrompt);
    expect(systemMessageContent?.startsWith(expectedHint)).toBe(true);
    expect(systemMessageContent).toBe(
      `${expectedHint}\n\n${originalSystemPrompt}`
    );
  });

  it('should use original prompt if directory structure is undefined', async () => {
    const snippet = 'const y = 20;';
    await determineFilePath(snippet, undefined);

    expect(unitTestSpy).toHaveBeenCalledTimes(1);
    const messages = unitTestSpy?.mock.calls[0][0].messages;
    const systemMessageContent = messages.find(
      (m: any) => m.role === 'system'
    )?.content;

    expect(systemMessageContent).toBe(originalSystemPrompt);
    expect(systemMessageContent).not.toContain('Hint:');
  });

  it('should use original prompt if directory structure is an empty array', async () => {
    const snippet = 'const z = 30;';
    await determineFilePath(snippet, []);

    expect(unitTestSpy).toHaveBeenCalledTimes(1);
    const messages = unitTestSpy?.mock.calls[0][0].messages;
    const systemMessageContent = messages.find(
      (m: any) => m.role === 'system'
    )?.content;

    expect(systemMessageContent).toBe(originalSystemPrompt);
    expect(systemMessageContent).not.toContain('Hint:');
  });
});
