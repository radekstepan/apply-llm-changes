<!-- __tests__/fixtures/markdown_file_tags.md -->
This file tests skipping blocks enclosed in <file> tags.

```typescript
<file path="packages/skip/this.ts">
// This content should not be processed or written
console.log("Skipped");
</file>
```
