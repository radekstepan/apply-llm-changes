// File: __tests__/index.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked'; // *** Ensure this import is present ***
import {
    extractExplicitBlocks,
    extractMarkdownBlocksWithParser,
    explicitCommentBlockRegex,
    explicitTagBlockRegex,
    type FilesMap,
} from '../src/parser'; // Adjust path if necessary

const fixturesDir = path.join(__dirname, 'fixtures');

// Parses input using explicit and Markdown extractors
function parseInput(inputText: string): FilesMap {
    const filesToWrite: FilesMap = new Map();
    let processedInput = extractExplicitBlocks(inputText, explicitCommentBlockRegex, "Comment Block", filesToWrite);
    processedInput = extractExplicitBlocks(processedInput, explicitTagBlockRegex, "Tag Block", filesToWrite);
    extractMarkdownBlocksWithParser(processedInput, filesToWrite);
    return filesToWrite;
}

// Compares multiline strings, ignoring leading/trailing whitespace and empty lines at start/end
function expectMultiLineStringEqual(received: string | undefined, expected: string): void {
    expect(received).toBeDefined();
    if (received === undefined) return;

    const normalize = (str: string) => str.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    const receivedLines = normalize(received);
    const expectedLines = normalize(expected);

    expect(receivedLines).toEqual(expectedLines);
}


describe('LLM Apply Changes Parser', () => {
    // --- Existing TESTS remain the same ---

    it('parses empty input correctly', () => {
        try {
            // Note: empty.txt doesn't exist, so this test will likely always run the 'catch' block.
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
        // Debugging
        if(result.size !== 1) {
            console.log("DEBUG (paragraph path): Files found:", Array.from(result.keys()));
            const tokens = marked.lexer(input);
             console.log("DEBUG (paragraph path): Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text})), null, 2));
        }
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
         // Debugging
         if(result.size !== 1) {
            console.log("DEBUG (standalone path): Files found:", Array.from(result.keys()));
            const tokens = marked.lexer(input);
             console.log("DEBUG (standalone path): Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text})), null, 2));
        }
        expect(result.size).toBe(1);
        expect(result.has('path/to/my_script.py')).toBe(true);
        const fileData = result.get('path/to/my_script.py');
        expect(fileData?.format).toBe('Markdown Block');
        expect(fileData?.content?.trim()).toContain(`import sys`);
        expect(fileData?.content?.trim()).toContain(`main()`);
    });

    it('handles markdown block with no preceding path', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'no_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(0);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Code block found, but could not determine file path"));
        expect(errorSpy).not.toHaveBeenCalled();


        errorSpy.mockRestore();
        warnSpy.mockRestore();
        logSpy.mockRestore();
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

    it('normalizes backslashes in paths (using Markdown parser)', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'path_normalization.md'), 'utf8');
        const result = parseInput(input);

        if (result.size !== 1 || !result.has('src/utils/helpers.ts')) {
            console.log("Test Debug: Files found:", Array.from(result.keys()));
            // Now this should work after adding the import
            const tokens = marked.lexer(input);
            console.log("Test Debug: Marked Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text})), null, 2));
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

    it('does NOT extract path if not immediately preceding code block', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const input = `
Some text mentioning \`path/to/some_other_file.js\`.

Some intermediate paragraph.

\`\`\`javascript
const code = true;
\`\`\`
        `;
        const result = parseInput(input);
        expect(result.size).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Code block found, but could not determine file path"));
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('parses markdown block with path in header comment', () => {
        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_header_comment_path.md'), 'utf8');
        const result = parseInput(input);
        expect(result.size).toBe(1);
        const expectedPath = 'src/__tests__/utils/headerCommentUtil.test.ts';
        expect(result.has(expectedPath)).toBe(true);
        const fileData = result.get(expectedPath);
        expect(fileData?.format).toBe('Markdown Block');
        // Check if the content is correct (excluding the comment block itself if desired, though current logic includes it)
        expect(fileData?.content).toContain("describe('Header Comment Path Util', () => {");
        expect(fileData?.content).toContain("expect(true).toBe(true);");
        // Verify the comment block IS included in the content by default
        expect(fileData?.content?.trim().startsWith('/*')).toBe(true);
        expect(fileData?.content?.trim().endsWith('});')).toBe(true); // Check end of code
    });

    it('skips markdown block with invalid path in preceding bolded list item', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_list_item_invalid_path.md'), 'utf8');
        const result = parseInput(input);

        // Debugging if test fails
        if (result.size !== 1 || !result.has('src/valid-component.jsx')) {
            console.log("DEBUG (invalid list item path): Files found:", Array.from(result.keys()));
            const tokens = marked.lexer(input);
             console.log("DEBUG (invalid list item path): Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text?.substring(0,50), raw: t.raw.substring(0,50)})), null, 2));
        }

        // Only the valid path should be present
        expect(result.size).toBe(1);
        expect(result.has('src/valid-component.jsx')).toBe(true);

        // Ensure the invalid paths were NOT added
        expect(result.has('http://example.com/not/a/local/path.js')).toBe(false);
        expect(result.has('C:/absolute/path/on/windows.txt')).toBe(false); // Path normalization would convert backslashes if it *was* processed

        // Check the content of the valid file
        const fileData = result.get('src/valid-component.jsx');
        expect(fileData?.format).toBe('Markdown Block');
        expectMultiLineStringEqual(fileData?.content, `
// This should be parsed correctly.
import React from 'react';

function ValidComponent() {
  return <div>Valid</div>;
}

export default ValidComponent;
        `);

        // We expect warnings for the 3 code blocks whose paths were skipped or missing
        // (The two invalid ones, and the final one with no path info)
        expect(warnSpy).toHaveBeenCalledTimes(3);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Code block found, but could not determine file path"));

        // No errors expected
        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('parses markdown block with path in first line comment', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_first_line_comment_path.md'), 'utf8');
        const result = parseInput(input);

        if (result.size !== 4) {
            console.log("DEBUG (first line comment path): Files found:", Array.from(result.keys()));
            const tokens = marked.lexer(input);
            console.log("DEBUG (first line comment path): Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text?.substring(0,50), raw: t.raw.substring(0,50)})), null, 2));
        }

        expect(result.size).toBe(4); // Expect the 4 valid files

        const path1 = 'packages/whisper/src/dockerManager.ts';
        const path2 = 'scripts/process_data.py';
        const path3 = 'styles/layout.css';
        const path4 = 'packages/ui/src/components/SessionView/Transcription/Transcription.tsx';

        // Check file 1 (Typescript, // path)
        expect(result.has(path1)).toBe(true);
        const fileData1 = result.get(path1);
        expect(fileData1?.format).toBe('Markdown Block');
        expect(fileData1?.content).not.toContain('// packages/whisper/src/dockerManager.ts');
        expectMultiLineStringEqual(fileData1?.content, `
import { exec as callbackExec } from 'child_process';
import * as util from 'util';

// rest of the docker manager code
        `);

        // Check file 2 (Python, # path)
        expect(result.has(path2)).toBe(true);
        const fileData2 = result.get(path2);
        expect(fileData2?.format).toBe('Markdown Block');
        expect(fileData2?.content).not.toContain('# scripts/process_data.py');
        expectMultiLineStringEqual(fileData2?.content, `
import pandas as pd

def process():
    print("Processing data...")
        `);

        // Check file 3 (CSS, /* path */)
        expect(result.has(path3)).toBe(true);
        const fileData3 = result.get(path3);
        expect(fileData3?.format).toBe('Markdown Block');
        expect(fileData3?.content).not.toContain('/* styles/layout.css */');
        expectMultiLineStringEqual(fileData3?.content, `
body {
  display: flex;
}
        `);

        // Check file 4 (Typescript, // File: path)
        expect(result.has(path4)).toBe(true);
        const fileData4 = result.get(path4);
        expect(fileData4?.format).toBe('Markdown Block');
        expect(fileData4?.content).not.toContain('// File: packages/ui/src/components/SessionView/Transcription/Transcription.tsx');
        expectMultiLineStringEqual(fileData4?.content, `
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Session, StructuredTranscript } from '../../../types';

// Component logic here
        `);

        // Ensure the blocks with comments not on first line or invalid paths were skipped
        expect(result.has('src/config.js')).toBe(false);
        expect(result.has('../../etc/passwd')).toBe(false);

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Code block found, but could not determine file path"));

        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    // *** UPDATED TEST SUITE for content matching the simplified 5-block fixture ***
    it('parses markdown blocks identified by Path: or backticks', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Assuming the fixture file is named 'markdown_path_variants.md' or similar
        // Using 'markdown_backticks_in_code.md' for now, ensure it contains the 5-block content
        const input = fs.readFileSync(path.join(fixturesDir, 'markdown_backticks_in_code.md'), 'utf8');
        const result = parseInput(input);

        // Debugging if test fails
        if (result.size !== 5) { // Expecting 5 files now based on the provided structure
             console.log("DEBUG (path variants): Files found:", Array.from(result.keys()));
             const tokens = marked.lexer(input);
             console.log("DEBUG (path variants): Tokens:", JSON.stringify(tokens.map(t => ({type: t.type, text: (t as any).text?.substring(0,50), raw: t.raw.substring(0,50)})), null, 2));
        }

        expect(result.size).toBe(5); // Expecting 5 files: cleaner.js, extra.css, data.yaml, combo.sh, start_only.txt

        // 1. Path: src/utils/cleaner.js
        const path1 = 'src/utils/cleaner.js';
        expect(result.has(path1)).toBe(true);
        const fileData1 = result.get(path1);
        expect(fileData1?.format).toBe('Markdown Block');
        expect(fileData1?.content).not.toContain('```'); // Check no stray fences
        expectMultiLineStringEqual(fileData1?.content, `
function cleanInput(input) {
  // Function implementation
  return input.trim();
}
        `);

        // 2. Path: src/styles/extra.css
        const path2 = 'src/styles/extra.css';
        expect(result.has(path2)).toBe(true);
        const fileData2 = result.get(path2);
        expect(fileData2?.format).toBe('Markdown Block');
        expect(fileData2?.content).not.toContain('```'); // Check no stray fences
        expectMultiLineStringEqual(fileData2?.content, `
.extra-class {
  padding: 10px; /* example */
}
        `);

        // 3. Path: config/data.yaml
        const path3 = 'config/data.yaml';
        expect(result.has(path3)).toBe(true);
        const fileData3 = result.get(path3);
        expect(fileData3?.format).toBe('Markdown Block');
        expect(fileData3?.content).not.toContain('```'); // Check no stray fences
        expect(fileData3?.content?.startsWith('key:')).toBe(true); // Check start of content
        expectMultiLineStringEqual(fileData3?.content, `
key: value
list:
  - item1
  - item2
        `);

        // 4. internal/code_example.txt -> Should NOT be parsed as no code block follows immediately
        expect(result.has('internal/code_example.txt')).toBe(false);

        // 5. Path: scripts/combo.sh
        const path5 = 'scripts/combo.sh';
        expect(result.has(path5)).toBe(true);
        const fileData5 = result.get(path5);
        expect(fileData5?.format).toBe('Markdown Block');
        expect(fileData5?.content).not.toContain('```'); // Check no stray fences
        expectMultiLineStringEqual(fileData5?.content, `
#!/bin/bash
echo "Combo"
        `);

        // 6. Path: start_only.txt
        const path6 = 'start_only.txt';
        expect(result.has(path6)).toBe(true);
        const fileData6 = result.get(path6);
        expect(fileData6?.format).toBe('Markdown Block');
        expect(fileData6?.content).not.toContain('```'); // Check no stray fences
        expectMultiLineStringEqual(fileData6?.content, `
Just the start fence included
This line is fine
        `);

        // No warnings expected for these specific cases, errors neither
        // Since internal/code_example.txt doesn't have a code block after it,
        // the parser shouldn't generate a "no path found for code block" warning for it.
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

});
