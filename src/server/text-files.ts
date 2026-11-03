import fs from 'node:fs';
import path from 'node:path';

/** directories never entered, at any depth under a session folder */
export const SKIPPED_DIRS = new Set(['tool-cache', 'node_modules', '.git', '__pycache__']);

/** extensions tailed; a file without extension is tailed when its first bytes are text */
const TEXT_EXTENSIONS = new Set([
  '.log', '.output', '.out', '.txt', '.stdout', '.stderr', '.err', '.md', '.sql', '.tsv', '.csv',
  '.jsonl', '.ndjson', '.yaml', '.yml', '.sh', '.ts', '.js', '.py', '.diff', '.patch',
]);
/** .json is data more often than log: tailed only while small */
const JSON_MAX_BYTES = 1024 * 1024;
const SNIFF_BYTES = 8192;

/** true when the first bytes hold no NUL and decode as UTF-8 without many replacement characters */
export function looksLikeText(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(SNIFF_BYTES);
    const got = fs.readSync(fd, buf, 0, SNIFF_BYTES, 0);
    if (got === 0) return true;
    const head = buf.subarray(0, got);
    if (head.includes(0)) return false;
    const bad = (head.toString('utf8').match(/�/g) ?? []).length;
    return bad * 50 < got;
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/** the rule: by extension first, then by content for the extensionless; size caps where the extension is data */
export function isTextCandidate(file: string, size: number): boolean {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (base.startsWith('.')) return false; // .DS_Store and friends
  if (ext === '.json') return size <= JSON_MAX_BYTES && looksLikeText(file);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (ext === '') return looksLikeText(file);
  return false;
}
