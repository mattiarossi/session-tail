import { z } from 'zod';

import { HighlightRule } from '../../../lib/rules';
import { deleteRule, listRules, resetRules, saveRule } from '../../rules-store';
import { publicProcedure, router } from '../trpc';

export const rulesRouter = router({
  list: publicProcedure.query(() => listRules()),
  save: publicProcedure.input(HighlightRule).mutation(({ input }) => {
    saveRule(input);
    return listRules();
  }),
  delete: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    deleteRule(input.id);
    return listRules();
  }),
  reset: publicProcedure.mutation(() => resetRules()),
});
