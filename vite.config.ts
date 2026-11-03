import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ mode, command }) => {
  // every key (prefix ''), so the server modules read the roots and the store when they load
  Object.assign(process.env, loadEnv(mode, HERE, ''));
  // the dev server only: a build opens no watcher and no store
  const server = command === 'serve' ? [(await import('./src/server/vite-trpc-plugin')).viteTrpcPlugin()] : [];
  return {
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), tailwindcss(), ...server],
    resolve: { alias: { '~': path.join(HERE, 'src') } },
    server: {
      port: Number(process.env.SESSION_TAIL_PORT) || 3459,
      host: '127.0.0.1',
    },
  };
});
