// __tests__/index.test.ts

import * as fs from 'fs';
import * as path from 'path';
import * as parser from '../src/parser';
import { FilesMap, explicitCommentBlockRegex, explicitTagBlockRegex } from '../src/parser';

const fixturesDir = path.join(__dirname, 'fixtures');

/** Helper to run both explicit and markdown parsing */
async function parseAll(input: string): Promise<FilesMap> {
  const files: FilesMap = new Map();
  let remaining = parser.extractExplicitBlocks(
    input,
    explicitCommentBlockRegex,
    'Comment Block',
    files
  );
  remaining = parser.extractExplicitBlocks(
    remaining,
    explicitTagBlockRegex,
    'Tag Block',
    files
  );
  await parser.extractMarkdownBlocksWithParser(remaining, files);
  return files;
}

describe('Parser Integration Tests', () => {
  jest.setTimeout(20000);

  describe('Explicit Blocks', () => {
    it('parses explicit comment blocks', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'explicit_comment.txt'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/component.ts')).toBe(true);
    });

    it('parses explicit tag blocks', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'explicit_tag.txt'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('data/config.json')).toBe(true);
    });
  });

  describe('Markdown Preceding Path', () => {
    it('paragraph path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_paragraph_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/app.js')).toBe(true);
    });

    it('heading path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_heading_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('styles/main.css')).toBe(true);
    });

    it('standalone path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_standalone_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('path/to/my_script.py')).toBe(true);
    });
  });

  describe('Mixed Fixtures', () => {
    it('handles no path gracefully', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'no_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.size).toBe(0);
    });

    it('mixed explicit and markdown blocks', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'mixed_blocks.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('config/settings.yaml')).toBe(true);
      expect(files.has('scripts/run.sh')).toBe(true);
      expect(files.has('docs/README.md')).toBe(true);
    });

    it('normalizes backslashes', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'path_normalization.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/utils/helpers.ts')).toBe(true);
    });
  });

  describe('Invalid or Edge Cases', () => {
    // it('skips invalid list item paths', async () => {
    //   const input = fs.readFileSync(path.join(fixturesDir, 'markdown_list_item_invalid_path.md'), 'utf8');
    //   const files = await parseAll(input);

    //   expect(files.has('src/valid-component.jsx')).toBe(true);
    //   expect(files.size).toBe(1);
    // });

    it('handles front matter path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_front_matter_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('packages/api/src/db/sqliteService.ts')).toBe(true);
    });

    it('handles header comment path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_header_comment_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/__tests__/utils/headerCommentUtil.test.ts')).toBe(true);
    });

    it('handles first line comment paths', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_first_line_comment_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('packages/whisper/src/dockerManager.ts')).toBe(true);
      expect(files.has('scripts/process_data.py')).toBe(true);
      expect(files.has('styles/layout.css')).toBe(true);
      expect(files.has('packages/ui/src/components/SessionView/Transcription/Transcription.tsx')).toBe(true);
      expect(files.has('packages/api/src/api/sessionHandler.ts')).toBe(true);
    });

    it('handles backticks path variants', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_backticks_in_code.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/utils/cleaner.js')).toBe(true);
      expect(files.has('src/styles/extra.css')).toBe(true);
      expect(files.has('config/data.yaml')).toBe(true);
      expect(files.has('scripts/combo.sh')).toBe(true);
      expect(files.has('start_only.txt')).toBe(true);
    });
  });
});
