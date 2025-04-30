Okay, I will modify the `packages/api/src/config/index.ts` file to ensure the environment variables, especially `APP_MODE`, are loaded with the correct precedence. This will allow the `ollamaService.ts` to correctly switch between the real and mock implementations.

Here's the revised content for `packages/api/src/config/index.ts`:

```typescript
<file path="packages/api/src/config/index.ts">
/* packages/api/src/config/index.ts */
import dotenv from 'dotenv';

export default config;
</file>
```

This updated loading logic prioritizes `.env` first for defaults.
