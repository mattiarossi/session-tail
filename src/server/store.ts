import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { layout } from './layout';

/** the local store: preferences, highlight rules and the transcript cache; created when absent, ignored by git */
export const STORE_FILE = layout().storeFile;
fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });

/** one connection for the process; each module that keeps a table creates it on load */
export const db = new DatabaseSync(STORE_FILE);
db.exec('PRAGMA journal_mode = WAL');
