import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { RulesEditor } from '~/components/rules-editor';
import { PREFERENCE_KEYS, type Preferences } from '~/lib/preferences';
import { SourceKind } from '~/lib/types';
import { useTRPC } from '~/lib/trpc';

export const Route = createFileRoute('/preferences')({ component: PreferencesPage });

function PreferencesPage() {
  const t = useTRPC();
  const qc = useQueryClient();
  const { data: prefs } = useQuery(t.preferences.get.queryOptions());
  const { data: where } = useQuery(t.preferences.where.queryOptions());
  const invalidate = () => qc.invalidateQueries({ queryKey: t.preferences.get.queryKey() });
  const set = useMutation(t.preferences.set.mutationOptions({ onSuccess: invalidate }));
  const reset = useMutation(t.preferences.reset.mutationOptions({ onSuccess: invalidate }));
  if (!prefs) return <p className="p-6 text-sm text-gray-500">reading…</p>;
  const patch = (p: Partial<Preferences>) => set.mutate(p);
  return (
    <div className="max-w-3xl overflow-y-auto p-6 text-sm">
      <h1 className="text-lg font-semibold">Preferences</h1>
      <p className="mt-1 text-xs text-gray-500">kept in {where}</p>
      <div className="mt-4 grid grid-cols-[12rem_1fr] items-center gap-x-4 gap-y-3">
        <label>kinds in the stream</label>
        <div className="flex gap-3">
          {SourceKind.options.map(k => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={prefs.kinds.includes(k)} onChange={e => patch({ kinds: e.target.checked ? [...prefs.kinds, k] : prefs.kinds.filter(x => x !== k) })} />
              {k}
            </label>
          ))}
        </div>
        <Num label="backfill lines" value={prefs.backfill_lines} min={0} max={5000} onChange={v => patch({ backfill_lines: v })} />
        <Num label="lines kept in the stream" value={prefs.max_rows} min={1000} max={200000} onChange={v => patch({ max_rows: v })} />
        <Num label="idle after (hours)" value={prefs.idle_hours} min={1} max={720} onChange={v => patch({ idle_hours: v })} />
        <Num label="log font size (px)" value={prefs.font_size} min={8} max={18} onChange={v => patch({ font_size: v })} />
        <Num label="interface font size (px)" value={prefs.ui_font_size} min={10} max={18} onChange={v => patch({ ui_font_size: v })} />
        <label>wrap long lines</label>
        <input type="checkbox" checked={prefs.wrap} onChange={e => patch({ wrap: e.target.checked })} className="justify-self-start" />
        <label>time column</label>
        <input type="checkbox" checked={prefs.show_time} onChange={e => patch({ show_time: e.target.checked })} className="justify-self-start" />
        <label>file column in the stream</label>
        <input type="checkbox" checked={prefs.show_file} onChange={e => patch({ show_file: e.target.checked })} className="justify-self-start" />
        <label>time markers in the stream</label>
        <input type="checkbox" checked={prefs.stream_markers} onChange={e => patch({ stream_markers: e.target.checked })} className="justify-self-start" />
        <label>collapse long bursts in the stream</label>
        <input type="checkbox" checked={prefs.collapse_bursts} onChange={e => patch({ collapse_bursts: e.target.checked })} className="justify-self-start" />
      </div>
      <button className="mt-4 rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => reset.mutate()}>
        reset the {PREFERENCE_KEYS.length} preferences
      </button>
      <h2 className="mt-8 text-base font-semibold">Highlight rules</h2>
      <p className="mt-1 text-xs text-gray-500">applied in order; the filter's matches take precedence over every rule</p>
      <RulesEditor />
    </div>
  );
}

function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <>
      <label>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = Number(e.target.value);
          if (Number.isInteger(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-28 rounded border border-gray-300 px-2 py-1"
      />
    </>
  );
}
