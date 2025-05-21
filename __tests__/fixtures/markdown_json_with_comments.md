This file tests JSON comment stripping.
The `extractAllCodeBlocks` function should extract the content with comments.
The actual stripping happens in the `index.ts` writing phase using `stripJsonComments` util.

Path: config/settings_with_comments.json

```json
{
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
    "api_key": "keep//this/string/with/slashes",
    "another_url": "http://test.com"
  },
  "features": [
    "feature1", // enabled
    "feature2"  /* disabled temporarily */
  ],
  // "debug_mode": true, // This whole line should be removed by stripJsonComments
  "empty_lines_will_be_handled": null,
  "truthy_value": true,
  "falsy_value": false
}
```

Path: data/another_data.json
```json
// This is a very simple JSON
{ "message": "Hello world!" /* greeting */ }
```
