import compression from 'compression';
import type { Server } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

import { TRPC_PATH, attachTrpc } from './trpc-ws';

export function viteTrpcPlugin(): Plugin {
  return {
    name: 'session-tail:trpc-ws',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(compression() as never);
      const httpServer = server.httpServer;
      if (!httpServer) {
        server.config.logger.warn('[trpc-ws] no httpServer; skipping WS attach');
        return;
      }
      attachTrpc(httpServer as Server, line => server.config.logger.info(line));
      httpServer.once('listening', () => {
        const addr = httpServer.address();
        const portStr = typeof addr === 'object' && addr ? `:${addr.port}` : '';
        server.config.logger.info(`[trpc-ws] tRPC ready at ws://127.0.0.1${portStr}${TRPC_PATH}`);
      });
    },
  };
}
