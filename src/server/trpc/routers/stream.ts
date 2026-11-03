import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { StreamFilter } from '../../../lib/types';
import { publicProcedure, router } from '../trpc';

function checkRegex(p: string | null, what: string): void {
  if (p === null) return;
  try {
    new RegExp(p);
  } catch (e) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${what}: ${(e as Error).message}` });
  }
}

export const streamRouter = router({
  all: publicProcedure.input(StreamFilter).subscription(async function* ({ ctx, input, signal }) {
    checkRegex(input.include, 'include');
    checkRegex(input.exclude, 'exclude');
    for await (const e of ctx.registry.stream(input, signal)) yield e;
  }),
  file: publicProcedure
    .input(z.object({ path: z.string().min(1), afterOffset: z.number().int().min(0) }))
    .subscription(async function* ({ ctx, input, signal }) {
      if (!ctx.registry.sources.has(input.path)) throw new TRPCError({ code: 'NOT_FOUND', message: `not a source: ${input.path}` });
      for await (const lines of ctx.registry.streamFile(input.path, input.afterOffset, signal)) yield lines;
    }),
});
