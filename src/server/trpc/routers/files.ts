import { TRPCError } from '@trpc/server';

import { readLines } from '../../../lib/line-reader';
import { type FilePage, FileRead } from '../../../lib/types';
import { publicProcedure, router } from '../trpc';

export const filesRouter = router({
  read: publicProcedure.input(FileRead).query(({ ctx, input }): FilePage => {
    const s = ctx.registry.sources.get(input.path);
    if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: `not a source: ${input.path}` });
    const virtual = ctx.registry.pageVirtual(input.path, input.offset, Math.min(5000, input.maxBytes));
    if (virtual) return virtual;
    try {
      const r = readLines(input.path, input.offset, input.maxBytes);
      return { firstLineNumber: input.offset === 0 ? 1 : 0, lines: r.lines, nextOffset: r.nextOffset, size: r.size, eof: r.nextOffset >= r.size };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { firstLineNumber: 1, lines: [], nextOffset: input.offset, size: input.offset, eof: true };
      throw e;
    }
  }),
});
