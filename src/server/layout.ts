/**
 * layout.ts — the roots the collector watches and the store's place, in the two layouts the tool
 * runs in: the checkout (`yarn dev`, `yarn probe`) and the installed package (`session-tail` on the
 * PATH, build-info.json beside server.mjs). Read after the environment is complete.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export interface BuildInfo {
  version: string;
  commit: string;
  dirty: boolean;
  builtAt: string;
  node: string;
}

export interface Layout {
  kind: 'checkout' | 'installed';
  root: string;
  /** the scratchpad roots, each holding <project-slug>/<session-id>/{scratchpad,tasks} */
  roots: string[];
  /** ~/.claude/projects: <project-slug>/<session-id>.jsonl and <project-slug>/<session-id>/tool-results */
  transcriptsRoot: string;
  storeFile: string;
  /** the built pages the installed server serves; null in the checkout */
  clientDir: string | null;
  build: BuildInfo | null;
}

function defaultScratchpadRoot(): string {
  return `/private/tmp/claude-${os.userInfo().uid}`;
}

function detect(): Layout {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = (process.env.SESSION_TAIL_ROOTS || defaultScratchpadRoot())
    .split(':')
    .filter(Boolean)
    .map(p => path.resolve(p));
  const transcriptsRoot = path.resolve(process.env.SESSION_TAIL_TRANSCRIPTS || path.join(os.homedir(), '.claude', 'projects'));
  const info = path.join(here, 'build-info.json');
  if (fs.existsSync(info)) {
    return {
      kind: 'installed',
      root: here,
      roots,
      transcriptsRoot,
      storeFile: process.env.SESSION_TAIL_STORE
        ? path.resolve(process.env.SESSION_TAIL_STORE)
        : path.join(os.homedir(), '.config', 'session-tail', 'store.sqlite'),
      clientDir: path.join(here, 'client'),
      build: JSON.parse(fs.readFileSync(info, 'utf8')) as BuildInfo,
    };
  }
  const root = path.resolve(here, '../..'); // src/server → the checkout
  return {
    kind: 'checkout',
    root,
    roots,
    transcriptsRoot,
    storeFile: path.resolve(root, process.env.SESSION_TAIL_STORE || 'store.sqlite'),
    clientDir: null,
    build: null,
  };
}

let decided: Layout | null = null;

/** the layout of the running code, decided on first use */
export function layout(): Layout {
  decided ??= detect();
  return decided;
}

/** the installed server's environment file: $SESSION_TAIL_ENV_FILE, else .env of the working directory; the environment wins */
export function loadEnvFile(): string | null {
  const file = process.env.SESSION_TAIL_ENV_FILE || path.resolve('.env');
  if (!fs.existsSync(file)) return null;
  for (const [k, v] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return file;
}
