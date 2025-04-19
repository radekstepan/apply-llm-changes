import * as fs from 'fs';
import * as path from 'path';
import {
    extractExplicitBlocks,
    extractMarkdownBlocksWithPeg,
    explicitCommentBlockRegex,
    explicitTagBlockRegex,
    type FilesMap,
} from '../src/parser';

const fixturesDir = path.join(__dirname, 'fixtures');

// Parses input using explicit and Markdown extractors
function parseInput(inputText: string): FilesMap {
    const filesToWrite: FilesMap = new Map();
    let processedInput = extractExplicitBlocks(inputText, explicitCommentBlockRegex, "Comment Block", filesToWrite);
    processedInput = extractExplicitBlocks(processedInput, explicitTagBlockRegex, "Tag Block", filesToWrite);
    extractMarkdownBlocksWithPeg(processedInput, filesToWrite);
    return filesToWrite;
}

// Compares multiline strings, ignoring leading/trailing whitespace
function expectMultiLineStringEqual(received: string | undefined, expected: string): void {
    expect(received).toBeDefined();
    if (received === undefined) return;
    const receivedLines = received.trim().split(/\r?\n/).map(line => line.trim());
    const expectedLines = expected.trim().split(/\r?\n/).map(line => line.trim());
    expect(receivedLines).toEqual(expectedLines);
}

describe('LLM Apply Changes Parser', () => {
    it('parses empty input correctly', () => {
        try {
            const input = fs.readFileSync(path.join(fixturesDir, 'empty.txt'), 'utf8');
            const result = parseInput(input);
            expect(result.size).toBe(0);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                const result = parseInput('');
                expect(result.size).toBe(0);
            } else {
                throw e;
            }
        }
    });

    it('parses explicit comment blocks', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'explicit_comment.txt'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        expect(result.has('src/component.ts')).toBe(true);
        const fileData = result.get('src/component.ts');
        expect(fileData?.format).toBe('Comment Block');
        expectMultiLineStringEqual(fileData?.content, `
export class MyComponent {
  // component code
}
        `);
    });

    it('parses explicit tag blocks', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'explicit_tag.txt'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        expect(result.has('data/config.json')).toBe(true);
        const fileData = result.get('data/config.json');
        expect(fileData?.format).toBe('Tag Block');
        expectMultiLineStringEqual(fileData?.content, `
{
  "key": "value",
  "enabled": true
}
        `);
    });

    it('parses markdown block with path in preceding paragraph', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_paragraph_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        expect(result.has('src/app.js')).toBe(true);
        const fileData = result.get('src/app.js');
        expect(fileData?.format).toBe('Markdown Block');
        expectMultiLineStringEqual(fileData?.content, `
console.log('Hello World!');
const version = 1;
        `);
    });

    it('parses markdown block with path in preceding heading', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_heading_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        expect(result.has('styles/main.css')).toBe(true);
        const fileData = result.get('styles/main.css');
        expect(fileData?.format).toBe('Markdown Block');
        expectMultiLineStringEqual(fileData?.content, `
body {
  margin: 0;
  padding: 0;
  background-color: #f0f0f0;
}
        `);
    });

    it('parses markdown block with standalone path before it', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_standalone_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        expect(result.has('path/to/my_script.py')).toBe(true);
        const fileData = result.get('path/to/my_script.py');
        expect(fileData?.format).toBe('Markdown Block');
        expect(fileData?.content).toContain(`import sys`);
    });

    it('handles markdown block with no preceding path', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'no_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(0);

        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();

        errorSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('handles mixed explicit and markdown blocks correctly', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'mixed_blocks.md'), 'utf8');
        const result = parseInput(input);

        expect(result.size).toBe(3);

        expect(result.has('config/settings.yaml')).toBe(true);
        const yamlData = result.get('config/settings.yaml');
        expect(yamlData?.format).toBe('Comment Block');
        expectMultiLineStringEqual(yamlData?.content, `
port: 8080
database:
  url: postgres://...
        `);

        expect(result.has('scripts/run.sh')).toBe(true);
        const scriptData = result.get('scripts/run.sh');
        expect(scriptData?.format).toBe('Markdown Block');
        expectMultiLineStringEqual(scriptData?.content, `
#!/bin/bash
echo "Starting..."
node dist/index.js
echo "Done."
        `);

        expect(result.has('docs/README.md')).toBe(true);
        const docData = result.get('docs/README.md');
        expect(docData?.format).toBe('Tag Block');
        expectMultiLineStringEqual(docData?.content, `
# Project Docs
This is the documentation.
        `);
    });

    it('normalizes backslashes in paths (using PEG parser)', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'path_normalization.md'), 'utf8');
        const result = parseInput(input);

        if (result.size !== 1) {
            console.log("Test Debug: Files found:", Array.from(result.keys()));
        }

        expect(result.size).toBe(1);
        expect(result.has('src/utils/helpers.ts')).toBe(true);
        const fileData = result.get('src/utils/helpers.ts');
        expect(fileData).toBeDefined();
        if (!fileData) return;

        expect(fileData.format).toBe('Markdown Block');
        expectMultiLineStringEqual(fileData.content, `
export const helper = () => true;
        `);

        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
