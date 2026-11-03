import { filesRouter } from './routers/files';
import { preferencesRouter } from './routers/preferences';
import { rulesRouter } from './routers/rules';
import { sessionsRouter } from './routers/sessions';
import { streamRouter } from './routers/stream';
import { router } from './trpc';

export const appRouter = router({
  sessions: sessionsRouter,
  files: filesRouter,
  stream: streamRouter,
  preferences: preferencesRouter,
  rules: rulesRouter,
});

export type AppRouter = typeof appRouter;
