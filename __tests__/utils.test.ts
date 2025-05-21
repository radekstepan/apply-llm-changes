// __tests__/utils.test.ts
import { stripJsonComments, stripOuterMarkdownFences } from '../src/utils';

describe('stripJsonComments', () => {
  it('should remove single-line comments and reformat', () => {
    const jsonWithComments = `{
      // comment
      "key": "value", // another comment
      "anotherKey": "anotherValue"
    }`;
    const expectedJson = `{
  "key": "value",
  "anotherKey": "anotherValue"
}`;
    expect(stripJsonComments(jsonWithComments)).toBe(expectedJson);
  });

  it('should remove multi-line comments and reformat', () => {
    const jsonWithComments = `{
      /* multi-line
         comment */
      "key": "value"
    }`;
    const expectedJson = `{
  "key": "value"
}`;
    expect(stripJsonComments(jsonWithComments)).toBe(expectedJson);
  });

  it('should handle mixed comments and reformat JSON', () => {
    const jsonWithComments = `{
      // This is a top-level comment
      "name": "My Application", // Name of the app
      "version": "1.0.0",
      /*
       * Multi-line comment
       * for configuration details.
       */
      "config": {
        "host": "localhost", // Default host
        "port": 8080,
        "api_key": "keep//this/string/with/slashes"
      },
      "features": [
        "feature1", // enabled
        "feature2"  /* disabled temporarily */
      ],
      // "debug_mode": true, // This whole line (key and value) should be removed
      "empty_lines_will_be_handled": null
    }`;
    const expectedJson = `{
  "name": "My Application",
  "version": "1.0.0",
  "config": {
    "host": "localhost",
    "port": 8080,
    "api_key": "keep//this/string/with/slashes"
  },
  "features": [
    "feature1",
    "feature2"
  ],
  "empty_lines_will_be_handled": null
}`;
    expect(stripJsonComments(jsonWithComments)).toBe(expectedJson);
  });

  it('should not remove slashes inside strings', () => {
    const jsonWithComments = `{
      "url": "http://example.com", // a URL
      "path": "file:///c:/path/to/file"
    }`;
    const expectedJson = `{
  "url": "http://example.com",
  "path": "file:///c:/path/to/file"
}`;
    expect(stripJsonComments(jsonWithComments)).toBe(expectedJson);
  });

  it('should return cleaned raw stripped string if JSON is invalid after stripping', () => {
    const invalidJsonFragment = `"key": "value" // comment`; // Not a full valid JSON object
    const expectedOutput = `"key": "value"`;
    // Suppress console.warn during this specific test
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(stripJsonComments(invalidJsonFragment)).toBe(expectedOutput);
    consoleWarnSpy.mockRestore();
  });

  it('should handle empty input string', () => {
    // Suppress console.warn during this specific test
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(stripJsonComments('')).toBe('');
    consoleWarnSpy.mockRestore();
  });

  it('should handle JSON with only comments, resulting in empty object', () => {
    const jsonWithOnlyComments = `{
      // line 1
      /* block 1 */
      // line 2
    }`;
    // After stripping, the content should parse to an empty object {}.
    // We then expect it to be stringified using the environment's default
    // pretty-printing for an empty object (e.g., JSON.stringify({}, null, 2)).
    // Standard Node.js produces "{\n}", but if the environment differs, this test will adapt.
    const expectedOutputForEmptyObject = JSON.stringify({}, null, 2);
    expect(stripJsonComments(jsonWithOnlyComments)).toBe(
      expectedOutputForEmptyObject
    );
  });

  it('should handle JSON with only comments (no braces), resulting in empty string', () => {
    const jsonWithOnlyComments = `
      // line 1
      /* block 1 */
      // line 2
    `;
    // After stripping, it becomes "\n\n\n", which fails to parse as JSON.
    // The fallback cleans it to an empty string.
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(stripJsonComments(jsonWithOnlyComments)).toBe('');
    consoleWarnSpy.mockRestore();
  });

  it('should handle already comment-free JSON and reformat it', () => {
    const jsonNoComments = `{"key":"value","array":[1,2],"nested":{"sub":"val"}}`;
    const expectedFormattedJson = `{
  "key": "value",
  "array": [
    1,
    2
  ],
  "nested": {
    "sub": "val"
  }
}`;
    expect(stripJsonComments(jsonNoComments)).toBe(expectedFormattedJson);
  });

  it('should preserve boolean and null values correctly', () => {
    const jsonWithComments = `{
      "active": true, // active status
      "optional": null, /* can be null */
      "valid": false
    }`;
    const expectedJson = `{
  "active": true,
  "optional": null,
  "valid": false
}`;
    expect(stripJsonComments(jsonWithComments)).toBe(expectedJson);
  });
});

describe('stripOuterMarkdownFences', () => {
  it('should strip basic double fences (content is a markdown block)', () => {
    const input = '```tsx\nconst a = 1;\n```';
    const expected = 'const a = 1;';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should strip double fences with language specifier (content is a markdown block)', () => {
    const input = '```javascript\nconsole.log("hello");\n```';
    const expected = 'console.log("hello");';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should strip double fences with extra newlines inside and trim result (content is a markdown block with surrounding newlines)', () => {
    const input = '```text\n\nInner content.\n\n```'; // Inner content has blank lines around it
    const expected = 'Inner content.';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should handle double fences where content is just newlines, resulting in empty string', () => {
    const input = '```\n\n```'; // Inner content is one blank line
    const expected = ''; // After stripping outer fences and inner blank line
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should handle double fences where content is effectively empty, resulting in empty string', () => {
    const input = '```\n```'; // No actual content lines between fences
    const expected = '';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should not strip if not a double fence (only start)', () => {
    const input = '```typescript\nconst b = 2;\n```\nSome other text.';
    expect(stripOuterMarkdownFences(input)).toBe(input);
  });

  it('should not strip if not a double fence (only end)', () => {
    const input = 'Some text.\n```\nconst c = 3;\n```';
    expect(stripOuterMarkdownFences(input)).toBe(input);
  });

  it('should not strip if no fences are present (plain text)', () => {
    const input = 'Just regular text.';
    expect(stripOuterMarkdownFences(input)).toBe(input);
  });

  it('should not strip content that is too short to be a fenced block (e.g. just one line fence)', () => {
    const input = '```tsx';
    expect(stripOuterMarkdownFences(input)).toBe(input);
  });

  it('should not strip empty string', () => {
    const input = '';
    expect(stripOuterMarkdownFences(input)).toBe(input);
  });

  it('should handle opening fence with trailing spaces', () => {
    const input = '```tsx  \n// code\n```';
    const expected = '// code';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  // This test's name and expectation are updated.
  // It tests the case where the `content` given to the function
  // IS a markdown block itself (which happens in a double-wrapped scenario).
  it('should strip content that is itself a complete markdown code block', () => {
    const input =
      '```typescript\n// This is a normal code block\nfunction test() {}\n```';
    const expected = '// This is a normal code block\nfunction test() {}';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  // This test should now pass with the improved trimming logic.
  it('should correctly strip content with internal leading/trailing spaces on lines but preserve them', () => {
    const input = '```\n  Indented line 1\n  Indented line 2\n```';
    const expected = '  Indented line 1\n  Indented line 2';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should strip fences with hyphens or dots in language', () => {
    const input = '```objective-c.old\n// code\n```';
    const expected = '// code';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should strip fences when first line is just ``` (no language)', () => {
    const input = '```\ncontent\n```';
    const expected = 'content';
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });

  it('should handle content with only spaces between fences', () => {
    const input = '```\n  \n```'; // Inner content is a line with only spaces
    const expected = ''; // Should become empty after trimming blank lines
    expect(stripOuterMarkdownFences(input)).toBe(expected);
  });
});
