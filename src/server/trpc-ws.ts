import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';

import { registry } from './registry';
import { seedRules } from './rules-store';
import { STORE_FILE } from './store';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/router';

export const TRPC_PATH = '/trpc';

export function attachTrpc(httpServer: Server, log: (line: string) => void): void {
  registry.start(log);
  const seeded = seedRules();
  log(`[store] ${STORE_FILE}${seeded ? ` · ${seeded} highlight rule(s) seeded` : ''}`);

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  const handler = applyWSSHandler({ wss, router: appRouter, createContext });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith(TRPC_PATH)) return; // the host's
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });

  const cleanup = () => {
    handler.broadcastReconnectNotification();
    wss.close();
    registry.stop();
  };
  httpServer.on('close', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
}
