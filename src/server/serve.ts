/**
 * serve.ts — the installed tool: `session-tail [--host <address>] [--port <n>] [--version]`.
 * One Node process serves the built pages and the tRPC server over a WebSocket on one port,
 * 127.0.0.1:3459 unless the flags say otherwise. The pages show commands and logs verbatim, connection
 * strings included; on an address other than the loopback the start line says anyone reaching the port
 * reads them.
 */
import compression from 'compression';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { layout, loadEnvFile } from './layout';

const USAGE = `usage: session-tail [--host <address>] [--port <n>] [--version]
  --host     the address to listen on (default 127.0.0.1; the tool has no authentication)
  --port     the port (default 3459; 0 = any free port)
  --version  the build
roots: SESSION_TAIL_ROOTS (default /private/tmp/claude-<uid>; ':' separates several), SESSION_TAIL_TRANSCRIPTS
  (default ~/.claude/projects), from the environment, else $SESSION_TAIL_ENV_FILE, else .env of the working directory
store: SESSION_TAIL_STORE, else ~/.config/session-tail/store.sqlite`;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

interface Flags { host: string; port: number; version: boolean }

function flags(argv: string[]): Flags | 'help' {
  const f: Flags = { host: '127.0.0.1', port: 3459, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return 'help';
    if (a === '--version') f.version = true;
    else if (a === '--host') f.host = argv[++i] ?? '';
    else if (a === '--port') f.port = Number(argv[++i]);
    else throw new Error(`unknown flag ${a}\n${USAGE}`);
  }
  if (!f.host) throw new Error(`--host needs an address\n${USAGE}`);
  if (!Number.isInteger(f.port) || f.port < 0 || f.port > 65535) throw new Error(`--port needs a number from 0 to 65535\n${USAGE}`);
  return f;
}

/** the file of the built pages a request names; index.html for a path that names none, which the client routes */
function fileFor(clientDir: string, url: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  const file = path.resolve(clientDir, `.${pathname}`);
  if (file !== clientDir && !file.startsWith(clientDir + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  return pathname.startsWith('/assets/') ? null : path.join(clientDir, 'index.html');
}

async function main(argv: string[]): Promise<number> {
  const f = flags(argv);
  if (f === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const envFile = loadEnvFile();
  const l = layout();
  if (!l.build || !l.clientDir) throw new Error('serve.ts runs from the package; in the checkout, run yarn dev');
  if (f.version) {
    process.stdout.write(`session-tail ${l.build.version} · commit ${l.build.commit.slice(0, 12)}${l.build.dirty ? ' · modified tree' : ''} · built ${l.build.builtAt}\n`);
    return 0;
  }
  const clientDir = l.clientDir;
  const assetsDir = path.join(clientDir, 'assets') + path.sep;
  // after the environment: the registry reads the roots and the store its place when they load
  const { TRPC_PATH, attachTrpc } = await import('./trpc-ws');

  const compress = compression();
  const server = http.createServer((req, res) => {
    compress(req as never, res as never, () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const file = fileFor(clientDir, req.url ?? '/');
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found\n');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': file.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });
  attachTrpc(server, line => process.stdout.write(`${line}\n`));
  server.on('upgrade', (req, socket) => {
    if (!req.url?.startsWith(TRPC_PATH)) socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(f.port, f.host, resolve);
  });
  const { port } = server.address() as AddressInfo;
  const host = f.host.includes(':') ? `[${f.host}]` : f.host;
  process.stdout.write(`session-tail ${l.build.version} · http://${host}:${port} · roots ${l.roots.join(', ')} · env file ${envFile ?? 'none'}\n`);
  if (!LOOPBACK.includes(f.host)) {
    process.stdout.write(`listening on ${f.host}: anyone who reaches this port reads every session's commands and logs — the tool has no authentication\n`);
  }
  const stop = () => process.exit(0);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return new Promise<number>(() => undefined);
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  e => {
    const message = (e as Error).message;
    process.stderr.write(`${message.startsWith('session-tail') ? message : `session-tail: ${message}`}\n`);
    process.exit(1);
  },
);
