import { Preferences } from '../../../lib/preferences';
import { getPreferences, resetPreferences, setPreferences } from '../../preferences-store';
import { STORE_FILE } from '../../store';
import { publicProcedure, router } from '../trpc';

export const preferencesRouter = router({
  get: publicProcedure.query(() => getPreferences()),
  /** the store's path, for the preferences page to name where they live */
  where: publicProcedure.query(() => STORE_FILE),
  set: publicProcedure.input(Preferences.partial()).mutation(({ input }) => setPreferences(input)),
  reset: publicProcedure.mutation(() => resetPreferences()),
});
