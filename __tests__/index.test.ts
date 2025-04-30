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
      const data = files.get('src/component.ts');
      expect(data).toBeDefined();
      expect(data!.content).toContain('export class MyComponent');
    });

    it('parses explicit tag blocks', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'explicit_tag.txt'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('data/config.json')).toBe(true);
      const data = files.get('data/config.json');
      expect(data).toBeDefined();
      expect(data!.content).toContain('"key": "value"');
    });
  });

  describe('Markdown Preceding Path', () => {
    it('paragraph path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_paragraph_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/app.js')).toBe(true);
      const data = files.get('src/app.js');
      expect(data).toBeDefined();
      expect(data!.content).toContain("console.log('Hello World!')");
    });

    it('heading path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_heading_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('styles/main.css')).toBe(true);
      const data = files.get('styles/main.css');
      expect(data).toBeDefined();
      expect(data!.content).toContain('background-color: #f0f0f0');
    });

    it('standalone path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_standalone_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('path/to/my_script.py')).toBe(true);
      const data = files.get('path/to/my_script.py');
      expect(data).toBeDefined();
      expect(data!.content).toContain('import sys');
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
      const yaml = files.get('config/settings.yaml')!;
      expect(yaml.content).toContain('port: 8080');
      const script = files.get('scripts/run.sh')!;
      expect(script.content).toContain('echo "Starting..."');
      const doc = files.get('docs/README.md')!;
      expect(doc.content).toContain('# Project Docs');
    });

    it('normalizes backslashes', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'path_normalization.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/utils/helpers.ts')).toBe(true);
      const data = files.get('src/utils/helpers.ts')!;
      expect(data.content).toContain('helper = () => true');
    });
  });

  describe('Invalid or Edge Cases', () => {
    it('handles front matter path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_front_matter_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('packages/api/src/db/sqliteService.ts')).toBe(true);
      const data = files.get('packages/api/src/db/sqliteService.ts')!;
      expect(data.content).toContain('import crypto from');
    });

    it('handles header comment path', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_header_comment_path.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/__tests__/utils/headerCommentUtil.test.ts')).toBe(true);
      const data = files.get('src/__tests__/utils/headerCommentUtil.test.ts')!;
      expect(data.content).toContain("expect(true).toBe(true)");
    });

    it('handles first line comment paths', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_first_line_comment_path.md'), 'utf8');
      const files = await parseAll(input);
      const paths = [
        'packages/whisper/src/dockerManager.ts',
        'scripts/process_data.py',
        'styles/layout.css',
        'packages/ui/src/components/SessionView/Transcription/Transcription.tsx',
        'packages/api/src/api/sessionHandler.ts'
      ];
      for (const p of paths) {
        expect(files.has(p)).toBe(true);
        const data = files.get(p)!;
        expect(data.content.length).toBeGreaterThan(0);
      }
    });

    it('handles backticks path variants', async () => {
      const input = fs.readFileSync(path.join(fixturesDir, 'markdown_backticks_in_code.md'), 'utf8');
      const files = await parseAll(input);
      expect(files.has('src/utils/cleaner.js')).toBe(true);
      expect(files.has('src/styles/extra.css')).toBe(true);
      expect(files.has('config/data.yaml')).toBe(true);
      expect(files.has('scripts/combo.sh')).toBe(true);
      expect(files.has('start_only.txt')).toBe(true);
      const cleaner = files.get('src/utils/cleaner.js')!;
      expect(cleaner.content).toContain('function cleanInput');
    });
  });

  describe('Double-comment explicit blocks (START_FILE_SOURCE)', () => {
    it('parses two explicit blocks wrapped in double comment fences', async () => {
      const input = fs.readFileSync(
        path.join(fixturesDir, 'markdown_double_comments.md'),
        'utf8'
      );
      const files = await parseAll(input);

      // should pick up both TSX and CSS blocks
      const tsxPath = 'packages/ui/src/components/SessionView/Chat/ChatMessages.tsx';
      const cssPath = 'packages/ui/src/styles/global.css';

      expect(files.has(tsxPath)).toBe(true);
      expect(files.has(cssPath)).toBe(true);

      const tsx = files.get(tsxPath)!;
      expect(tsx.content).toContain('import React, { useState } from \'react\'');
      expect(tsx.content).toContain('// TODO comments should not be removed');

      const css = files.get(cssPath)!;
      expect(css.content).toContain('@import \'@radix-ui/themes/styles.css\'');
    });
  });
});
