import { z } from 'zod';

import { publicProcedure, router } from '../trpc';

export const sessionsRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.registry.list()),
  get: publicProcedure.input(z.object({ project: z.string(), session: z.string() })).query(({ ctx, input }) => {
    const r = ctx.registry.sessions.get(`${input.project}/${input.session}`);
    return r ? ctx.registry.summary(r) : null;
  }),
  setTag: publicProcedure
    .input(z.object({ project: z.string(), session: z.string(), tag: z.string().max(24) }))
    .mutation(({ ctx, input }) => ctx.registry.setTag(input.project, input.session, input.tag)),
  changes: publicProcedure.subscription(async function* ({ ctx, signal }) {
    for await (const s of ctx.registry.sessionChanges(signal)) yield s;
  }),
});
