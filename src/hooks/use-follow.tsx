import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usePreferences } from '~/hooks/use-filter';
import type { Preferences } from '~/lib/preferences';
import { useTRPC } from '~/lib/trpc';

/** the files the follow panel tails: the `followed` preference, toggled from any page, applied at once */
export function useFollow() {
  const t = useTRPC();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const set = useMutation(
    t.preferences.set.mutationOptions({
      onMutate: async patch => {
        await qc.cancelQueries({ queryKey: t.preferences.get.queryKey() });
        qc.setQueryData<Preferences>(t.preferences.get.queryKey(), old => (old ? { ...old, ...patch } : old));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: t.preferences.get.queryKey() }),
    }),
  );
  const followed = prefs.followed;
  const toggle = (path: string) => {
    set.mutate({ followed: followed.includes(path) ? followed.filter(p => p !== path) : [...followed, path] });
  };
  return { followed, isFollowed: (path: string) => followed.includes(path), toggle };
}
