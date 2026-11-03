import { useSubscription } from '@trpc/tanstack-react-query';
import { useCallback, useRef, useState } from 'react';

import { useTRPC } from '~/lib/trpc';
import type { Line, Source, StreamEvent, StreamFilter } from '~/lib/types';

export interface StreamRow {
  key: string;
  sourceId: string;
  line: Line;
}

export function useStream(filter: StreamFilter, maxRows: number, enabled = true) {
  const t = useTRPC();
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [backfilled, setBackfilled] = useState(false);
  const pending = useRef<StreamRow[]>([]);
  const flush = useRef<number | null>(null);

  // new lines are batched into one state update per animation frame
  const enqueue = useCallback(
    (items: StreamRow[]) => {
      pending.current.push(...items);
      flush.current ??= requestAnimationFrame(() => {
        flush.current = null;
        const add = pending.current;
        pending.current = [];
        setRows(prev => {
          const next = prev.concat(add);
          return next.length > maxRows ? next.slice(next.length - maxRows) : next;
        });
      });
    },
    [maxRows],
  );

  const sub = useSubscription(
    t.stream.all.subscriptionOptions(filter, {
      enabled,
      onStarted() {
        setRows([]);
        setSources(new Map());
        setBackfilled(false);
      },
      onData(e: StreamEvent) {
        if (e.type === 'source') setSources(prev => new Map(prev).set(e.source.id, e.source));
        else if (e.type === 'lines') enqueue(e.lines.map(line => ({ key: `${e.sourceId}:${line.n}:${line.t}`, sourceId: e.sourceId, line })));
        else setBackfilled(true);
      },
    }),
  );
  return { rows, sources, backfilled, status: sub.status, error: sub.error, clear: () => setRows([]) };
}
