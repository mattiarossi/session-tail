import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { SKIPPED_DIRS } from './text-files';

export interface FileSeen {
  path: string;
  size: number;
  mtime: number;
}

export type WatchEvent = { type: 'file'; file: FileSeen } | { type: 'removed'; path: string };

const COALESCE_MS = 50;
export const RESCAN_MS = 30_000;

/** the files under a scratchpad root: <project>/<session>/{scratchpad,tasks}/** */
export function walkScratchpadRoot(root: string): FileSeen[] {
  const out: FileSeen[] = [];
  for (const project of subdirs(root)) {
    for (const session of subdirs(path.join(root, project))) {
      for (const area of ['scratchpad', 'tasks']) {
        walkFiles(path.join(root, project, session, area), out);
      }
    }
  }
  return out;
}

/** the files under the transcript root: <project>/<session>.jsonl and <project>/<session>/tool-results/* */
export function walkTranscriptRoot(root: string): FileSeen[] {
  const out: FileSeen[] = [];
  for (const project of subdirs(root)) {
    const dir = path.join(root, project);
    for (const entry of entries(dir)) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) stat(path.join(dir, entry.name), out);
      else if (entry.isDirectory()) walkFiles(path.join(dir, entry.name, 'tool-results'), out);
    }
  }
  return out;
}

function entries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function subdirs(dir: string): string[] {
  return entries(dir)
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIPPED_DIRS.has(e.name))
    .map(e => e.name);
}

function walkFiles(dir: string, out: FileSeen[]): void {
  for (const e of entries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIPPED_DIRS.has(e.name) && !e.name.startsWith('.')) walkFiles(p, out);
    } else if (e.isFile()) {
      stat(p, out);
    }
  }
}

function stat(p: string, out: FileSeen[]): void {
  try {
    const s = fs.statSync(p);
    out.push({ path: p, size: s.size, mtime: s.mtimeMs });
  } catch {
    // removed between the listing and the stat
  }
}

/**
 * Watches one root. 'event' carries a WatchEvent per changed or removed path; 'rescan' fires after
 * every full walk with the files seen, so the registry reconciles additions FSEvents did not report.
 */
export class RootWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private pending = new Map<string, NodeJS.Timeout>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    readonly root: string,
    private readonly walk: (root: string) => FileSeen[],
  ) {
    super();
  }

  start(): FileSeen[] {
    const first = this.walk(this.root);
    this.watcher = fs.watch(this.root, { recursive: true, persistent: true }, (_event, filename) => {
      if (!filename) {
        this.rescan();
        return;
      }
      const p = path.join(this.root, filename.toString());
      const prev = this.pending.get(p);
      if (prev) clearTimeout(prev);
      this.pending.set(
        p,
        setTimeout(() => {
          this.pending.delete(p);
          this.report(p);
        }, COALESCE_MS),
      );
    });
    this.watcher.on('error', e => this.emit('error', e));
    this.timer = setInterval(() => this.rescan(), RESCAN_MS);
    return first;
  }

  private report(p: string): void {
    try {
      const s = fs.statSync(p);
      if (s.isFile()) this.emit('event', { type: 'file', file: { path: p, size: s.size, mtime: s.mtimeMs } } satisfies WatchEvent);
      else if (s.isDirectory()) this.rescan(); // a new session folder: its files come with the walk
    } catch {
      this.emit('event', { type: 'removed', path: p } satisfies WatchEvent);
    }
  }

  rescan(): void {
    this.emit('rescan', this.walk(this.root));
  }

  stop(): void {
    this.watcher?.close();
    if (this.timer) clearInterval(this.timer);
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
