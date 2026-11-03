import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type HighlightRule, MATCH_CLASS, RuleColor, compileRules } from '~/lib/rules';
import { useTRPC } from '~/lib/trpc';

export function RulesEditor() {
  const t = useTRPC();
  const qc = useQueryClient();
  const { data: rules } = useQuery(t.rules.list.queryOptions());
  const done = { onSuccess: (list: HighlightRule[]) => qc.setQueryData(t.rules.list.queryKey(), list) };
  const save = useMutation(t.rules.save.mutationOptions(done));
  const remove = useMutation(t.rules.delete.mutationOptions(done));
  const reset = useMutation(t.rules.reset.mutationOptions(done));
  const [draft, setDraft] = useState<HighlightRule | null>(null);
  if (!rules) return null;
  const valid = new Set(compileRules(rules).map(c => c.rule.id));
  const edit = (r: HighlightRule) => setDraft({ ...r });
  const blank = (): HighlightRule => ({
    id: `rule-${Date.now().toString(36)}`, pattern: '', regex: true, caseSensitive: false, color: 'blue', scope: 'match', enabled: true,
    position: (rules.at(-1)?.position ?? 0) + 1,
  });
  return (
    <div className="mt-3">
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500"><tr><th className="py-1 pr-2">on</th><th className="pr-2">pattern</th><th className="pr-2">flags</th><th className="pr-2">colour</th><th className="pr-2">scope</th><th /></tr></thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id} className={`border-t border-gray-100 ${r.enabled ? '' : 'text-gray-400'}`}>
              <td className="py-1 pr-2"><input type="checkbox" checked={r.enabled} onChange={e => save.mutate({ ...r, enabled: e.target.checked })} /></td>
              <td className="pr-2 font-mono">
                <span className={valid.has(r.id) || !r.enabled ? '' : 'text-red-700'} title={valid.has(r.id) || !r.enabled ? '' : 'does not compile'}>{r.pattern}</span>
              </td>
              <td className="pr-2 font-mono text-gray-500">{r.regex ? '.*' : 'txt'} {r.caseSensitive ? 'Aa' : 'aa'}</td>
              <td className="pr-2"><span className={`px-1 ${MATCH_CLASS[r.color]}`}>{r.color}</span></td>
              <td className="pr-2">{r.scope}</td>
              <td className="text-right">
                <button className="mr-2 text-blue-700 hover:underline" onClick={() => edit(r)}>edit</button>
                <button className="text-red-700 hover:underline" onClick={() => remove.mutate({ id: r.id })}>delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => setDraft(blank())}>add a rule</button>
        <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => reset.mutate()}>reset to the defaults</button>
      </div>
      {draft && (
        <form
          className="mt-3 grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs"
          onSubmit={e => {
            e.preventDefault();
            if (draft.pattern) {
              save.mutate(draft);
              setDraft(null);
            }
          }}
        >
          <label>pattern</label>
          <input value={draft.pattern} onChange={e => setDraft({ ...draft, pattern: e.target.value })} className="rounded border border-gray-300 px-2 py-1 font-mono" autoFocus />
          <label>regular expression</label>
          <input type="checkbox" checked={draft.regex} onChange={e => setDraft({ ...draft, regex: e.target.checked })} className="justify-self-start" />
          <label>case sensitive</label>
          <input type="checkbox" checked={draft.caseSensitive} onChange={e => setDraft({ ...draft, caseSensitive: e.target.checked })} className="justify-self-start" />
          <label>colour</label>
          <select value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value as RuleColor })} className="w-32 rounded border border-gray-300 px-1 py-1">
            {RuleColor.options.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label>scope</label>
          <select value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value as HighlightRule['scope'] })} className="w-32 rounded border border-gray-300 px-1 py-1">
            <option value="match">the match</option>
            <option value="line">the whole line</option>
          </select>
          <label>position</label>
          <input type="number" value={draft.position} onChange={e => setDraft({ ...draft, position: Number(e.target.value) })} className="w-20 rounded border border-gray-300 px-2 py-1" />
          <div />
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-white">save</button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => setDraft(null)}>cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
