import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Dispatch, type ReactNode, type SetStateAction, createContext, useContext, useMemo, useState } from 'react';

import { EMPTY_FILTER, type Filter, compileFilter, decorate } from '~/lib/filter';
import { DEFAULT_PREFERENCES, type Preferences } from '~/lib/preferences';
import { compileRules } from '~/lib/rules';
import { useTRPC } from '~/lib/trpc';

interface FilterContextValue {
  filter: Filter;
  /** a state setter: callers patch through a function, so two changes in one tick both land */
  setFilter: Dispatch<SetStateAction<Filter>>;
}

const FilterContext = createContext<FilterContextValue>({ filter: EMPTY_FILTER, setFilter: () => undefined });

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  return <FilterContext.Provider value={{ filter, setFilter }}>{children}</FilterContext.Provider>;
}

export function useFilter(): FilterContextValue {
  return useContext(FilterContext);
}

export function usePreferences(): Preferences {
  const t = useTRPC();
  const { data } = useQuery(t.preferences.get.queryOptions());
  return data ?? DEFAULT_PREFERENCES;
}

/** a patch of the preferences, shown at once and saved; a failure brings the stored values back */
export function usePreferencePatch(): (patch: Partial<Preferences>) => void {
  const t = useTRPC();
  const qc = useQueryClient();
  const m = useMutation(
    t.preferences.set.mutationOptions({
      onMutate: async patch => {
        await qc.cancelQueries({ queryKey: t.preferences.get.queryKey() });
        qc.setQueryData<Preferences>(t.preferences.get.queryKey(), old => (old ? { ...old, ...patch } : old));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: t.preferences.get.queryKey() }),
    }),
  );
  return patch => m.mutate(patch);
}

/** the function a LineRow's `text` takes: the line decorated by the filter and the rules */
export function useHighlighter(): (s: string) => ReactNode {
  const t = useTRPC();
  const { filter } = useFilter();
  const { data: rules } = useQuery(t.rules.list.queryOptions());
  return useMemo(() => {
    const re = compileFilter(filter);
    const compiled = compileRules(rules ?? []);
    return (s: string) => {
      const d = decorate(s, re, compiled);
      const spans = d.spans.map((sp, i) => (sp.className ? <mark key={i} className={sp.className}>{sp.text}</mark> : <span key={i}>{sp.text}</span>));
      return d.lineClass ? <span className={d.lineClass}>{spans}</span> : <>{spans}</>;
    };
  }, [filter, rules]);
}
