// __tests__/utils.test.ts
import { stripJsonComments } from '../src/utils';

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
