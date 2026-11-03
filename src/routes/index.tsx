import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { FoldRow } from '~/components/fold-row';
import { LineRow } from '~/components/line-row';
import { MarkerRow } from '~/components/marker-row';
import { LogView } from '~/components/log-view';
import { useFilter, useHighlighter, usePreferences } from '~/hooks/use-filter';
import { useStream } from '~/hooks/use-stream';
import { filterPattern } from '~/lib/filter';
import { buildDisplay } from '~/lib/markers';
import { SourceKind, StreamFilter } from '~/lib/types';

/** one value or several: the page's own links write arrays, a hand-written URL `?s=<key>` a string */
const oneOrMany = <T extends z.ZodTypeAny>(item: T) => z.union([z.array(item), item.transform(v => [v] as z.infer<T>[])]).optional();

const Search = z.object({
  s: oneOrMany(z.string()),
  k: oneOrMany(SourceKind),
});

export const Route = createFileRoute('/')({
  validateSearch: Search,
  component: StreamPage,
});

function StreamPage() {
  const { s, k } = Route.useSearch();
  const [follow, setFollow] = useState(true);
  const prefs = usePreferences();
  const { filter: f } = useFilter();
  const pattern = filterPattern(f);
  const filter = StreamFilter.parse({
    sessions: s ?? [],
    kinds: k ?? prefs.kinds,
    include: f.mode === 'only' ? pattern : null,
    exclude: f.mode === 'exclude' ? pattern : null,
    caseSensitive: f.caseSensitive,
    backfill: prefs.backfill_lines,
  });
  const { rows, sources, backfilled, status, error, clear } = useStream(filter, prefs.max_rows);
  const text = useHighlighter();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (burstKey: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(burstKey)) next.delete(burstKey);
      else next.add(burstKey);
      return next;
    });
  const display = useMemo(
    () => buildDisplay(rows, { markers: prefs.stream_markers, collapse: prefs.collapse_bursts, expanded }),
    [rows, prefs.stream_markers, prefs.collapse_bursts, expanded],
  );
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
        <span>{s?.length ? `${s.length} session(s)` : 'every session'}</span>
        <span>· {sources.size} file(s)</span>
        <span>· {rows.length} line(s)</span>
        <span>· {status === 'pending' ? 'live' : status}{backfilled ? '' : ' (backfill…)'}</span>
        {error && <span className="text-red-700">{error.message}</span>}
        <span className="flex-1" />
        <button className="rounded border px-2 py-0.5 hover:bg-gray-50" onClick={clear}>clear</button>
        <button className={`rounded border px-2 py-0.5 ${follow ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`} onClick={() => setFollow(!follow)}>
          auto-scroll (G)
        </button>
      </div>
      <LogView
        rows={display}
        rowKey={d => (d.kind === 'line' ? d.row.key : d.key)}
        render={d =>
          d.kind === 'marker' ? (
            <MarkerRow t={d.t} source={sources.get(d.sourceId) ?? null} />
          ) : d.kind === 'ellipsis' ? (
            <FoldRow hidden={d.hidden} onClick={() => toggle(d.burstKey)} />
          ) : d.kind === 'collapse' ? (
            <FoldRow hidden={null} onClick={() => toggle(d.burstKey)} />
          ) : (
            <LineRow line={d.row.line} source={sources.get(d.row.sourceId) ?? null} showNumber={false} showTime={prefs.show_time} showFile={prefs.show_file} text={text} />
          )
        }
        follow={follow}
        onFollow={setFollow}
        wrap={prefs.wrap}
      />
    </>
  );
}
