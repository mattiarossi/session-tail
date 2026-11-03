/**
 * package.ts — `yarn package [--allow-dirty] [--out dir] [--skip-gates] [--verbose]`
 * Builds the tool as a package of its own: dist/session-tail/session-tail-<version>-<commit>.tgz.
 */
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import { build as esbuild } from 'esbuild';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import superjson from 'superjson';
import { build as viteBuild } from 'vite';

import type { BuildInfo } from '../src/server/layout';
import type { AppRouter } from '../src/server/trpc/router';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { name: string; version: string; engines: { node: string } };
/** ws's optional native accelerators: required inside a try, absent from the package; ws runs without them */
const EXTERNALS = ['bufferutil', 'utf-8-validate'];

function launcher(): string {
  const [major, minor] = (/(\d+)\.(\d+)/.exec(MANIFEST.engines.node) ?? ['', '22', '13']).slice(1).map(Number);
  return `#!/usr/bin/env node
// session-tail — the installed tool; the server is ../server.mjs
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < ${major} || (major === ${major} && minor < ${minor})) {
  process.stderr.write('session-tail needs Node ${major}.${minor} or later (node:sqlite); this is ' + process.version + '\\n');
  process.exit(1);
}
const path = require('node:path');
const { pathToFileURL } = require('node:url');
import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
`;
}

interface Flags { allowDirty: boolean; out: string; skipGates: boolean; verbose: boolean }

function flags(argv: string[]): Flags {
  const f: Flags = { allowDirty: false, out: path.join(ROOT, 'dist', 'session-tail'), skipGates: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-dirty') f.allowDirty = true;
    else if (a === '--skip-gates') f.skipGates = true;
    else if (a === '--verbose') f.verbose = true;
    else if (a === '--out') f.out = path.resolve(argv[++i] ?? '');
    else throw new Error(`unknown flag ${a}`);
  }
  return f;
}

const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitOr = (fallback: string, ...args: string[]): string => {
  try {
    return git(...args);
  } catch {
    return fallback;
  }
};

function run(label: string, cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) throw new Error(`${label}: cannot run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})\n${out.trim().split('\n').slice(-20).join('\n')}`);
  return out;
}

let verbose = false;
const stage = (name: string, outcome: string): void => void process.stderr.write(`package · ${name} · ${outcome}\n`);
const detail = (text: string): void => void (verbose && process.stderr.write(`         ${text}\n`));
const isNodeBuiltin = (name: string): boolean => builtinModules.includes(name) || builtinModules.includes(name.replace(/^node:/, '')) || name === 'node:sqlite';

function dirBytes(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return n;
}

/** the built package, from a temporary directory, over a temporary root with one session and one log line */
async function selfTest(pkg: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-tail-package-'));
  const scratch = path.join(tmp, 'scratch');
  const transcripts = path.join(tmp, 'transcripts');
  const sessionDir = path.join(scratch, '-tmp-selftest', '00000000-0000-0000-0000-000000000001', 'scratchpad');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(path.join(transcripts, '-tmp-selftest'), { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'selftest.log'), 'one line\n');
  const env = {
    ...process.env, SESSION_TAIL_ROOTS: scratch, SESSION_TAIL_TRANSCRIPTS: transcripts,
    SESSION_TAIL_STORE: path.join(tmp, 'store.sqlite'), SESSION_TAIL_ENV_FILE: path.join(tmp, 'none.env'),
  };
  const child = spawn(process.execPath, [path.join(pkg, 'bin', 'session-tail'), '--port', '0'], { cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let log = '';
    const origin = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no start line in 30 s:\n${log}`)), 30_000);
      child.stdout.on('data', (b: Buffer) => {
        log += b.toString();
        const m = /http:\/\/(127\.0\.0\.1:\d+)/.exec(log);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.stderr.on('data', (b: Buffer) => void (log += b.toString()));
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`the server exited (${code}) before listening:\n${log}`));
      });
    });
    detail(log.trim());
    const page = await fetch(`http://${origin}/`);
    const html = await page.text();
    if (page.status !== 200 || !html.includes('<div id="root"')) throw new Error(`GET / answered ${page.status} without the page`);
    const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    if (!script) throw new Error('the page names no script under /assets/');
    const js = await fetch(`http://${origin}${script}`);
    if (js.status !== 200 || !(js.headers.get('content-type') ?? '').startsWith('text/javascript')) throw new Error(`GET ${script} answered ${js.status}`);
    const route = await fetch(`http://${origin}/preferences`);
    if (route.status !== 200 || !(await route.text()).includes('<div id="root"')) throw new Error(`a client route answered ${route.status} without the page`);
    const ws = createWSClient({ url: `ws://${origin}/trpc` });
    try {
      const client = createTRPCClient<AppRouter>({ links: [wsLink<AppRouter>({ client: ws, transformer: superjson })] });
      const projects = await client.sessions.list.query();
      const sources = projects.flatMap(p => p.sessions).flatMap(s => s.sources);
      if (sources.length !== 1 || !sources[0].id.endsWith('selftest.log')) throw new Error(`sessions.list returned ${sources.length} source(s); the root holds one`);
      return `the page, ${script}, a client route, sessions.list over /trpc: 1 session, 1 source`;
    } finally {
      ws.close();
    }
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(argv: string[]): Promise<number> {
  const f = flags(argv);
  verbose = f.verbose;
  // a repository with no commit yet has no HEAD: the build is then dirty by definition
  const commit = gitOr('uncommitted', 'rev-parse', 'HEAD');
  const modified = gitOr('?? no commit yet', 'status', '--porcelain');
  const dirty = modified !== '';
  if (dirty && !f.allowDirty) throw new Error(`the tree is modified or carries untracked files:\n${modified.split('\n').slice(0, 12).join('\n')}\ncommit, or build with --allow-dirty (the version then carries -dirty)`);
  const stamp = new Date().toISOString();
  const version = `${MANIFEST.version.split('.').slice(0, 2).join('.')}.${stamp.slice(0, 16).replace(/[-T:]/g, '')}${dirty ? '-dirty' : ''}`;
  const tarName = `session-tail-${version}-${commit.slice(0, 8)}.tgz`;
  stage('identity', `${MANIFEST.name} ${version} · commit ${commit.slice(0, 12)}${dirty ? ' · modified tree' : ''}`);

  if (!f.skipGates) {
    run('tsc', path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['--noEmit'], ROOT);
    stage('gates', 'tsc');
  } else stage('gates', 'skipped (--skip-gates): not a package to ship');

  const out = path.join(f.out, 'package');
  fs.rmSync(f.out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'bin'), { recursive: true });

  const clientDir = path.join(out, 'client');
  await viteBuild({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'warn', build: { outDir: clientDir, emptyOutDir: true } });
  if (!dirty && git('status', '--porcelain', '--', path.join(ROOT, 'src', 'routeTree.gen.ts'))) throw new Error('the client build rewrote src/routeTree.gen.ts: commit it and build again');
  stage('client', `client/ · ${fs.readdirSync(path.join(clientDir, 'assets')).length} assets · ${(dirBytes(clientDir) / 1024).toFixed(0)} kB`);

  const bundle = path.join(out, 'server.mjs');
  const result = await esbuild({
    entryPoints: [path.join(ROOT, 'src', 'server', 'serve.ts')], absWorkingDir: ROOT,
    bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: bundle, sourcemap: true, metafile: true, logLevel: 'silent',
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    external: EXTERNALS,
  });
  const requires = new Set<string>();
  for (const o of Object.values(result.metafile.outputs)) for (const i of o.imports) if (i.external) requires.add(i.path);
  const unexpected = [...requires].filter(r => !EXTERNALS.includes(r) && !isNodeBuiltin(r));
  if (unexpected.length) throw new Error(`the bundle requires modules it does not carry: ${unexpected.join(', ')}`);
  stage('bundle', `server.mjs · ${Object.keys(result.metafile.inputs).length} modules · ${(fs.statSync(bundle).size / 1024 / 1024).toFixed(1)} MB`);

  fs.writeFileSync(path.join(out, 'bin', 'session-tail'), launcher(), { mode: 0o755 });
  fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(out, 'README.md'));
  stage('files', 'bin/session-tail · README');

  const info: BuildInfo = { version, commit, dirty, builtAt: stamp, node: process.version };
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
    name: MANIFEST.name, version, description: 'every Claude Code session\'s logs, tailed and labelled, in one page',
    bin: { 'session-tail': 'bin/session-tail' }, engines: MANIFEST.engines, license: 'UNLICENSED',
  }, null, 2) + '\n');
  stage('identity files', 'build-info.json · package.json');

  stage('self-test of the package', await selfTest(out));

  run('tar', 'tar', ['-czf', path.join(f.out, tarName), '-C', f.out, 'package'], f.out);
  const sources = run('tar list', 'tar', ['-tzf', path.join(f.out, tarName)], f.out).split('\n').filter(x => /\.tsx?$/.test(x));
  if (sources.length) throw new Error(`the tarball carries TypeScript sources: ${sources.slice(0, 5).join(', ')}`);
  stage('tarball', `${path.relative(ROOT, path.join(f.out, tarName))} · install with: npm install -g ${tarName}`);
  return 0;
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  e => {
    process.stderr.write(`package · failed · ${(e as Error).message}\n`);
    process.exit(1);
  },
);
