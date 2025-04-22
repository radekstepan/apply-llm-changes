This file tests the YAML front matter path syntax.

---
path: packages/api/src/db/sqliteService.ts
---
```typescript
import crypto from 'node:crypto'; // <-- Import crypto
import Database, { type Database as DB, type Statement, type RunResult } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import config from '../config/index.js';

export { db, run, get, all, exec, transaction, closeDb, initializeDatabase, schema };
```
