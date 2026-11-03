import { useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { BackLink } from '~/components/back-link';
import { LineRow } from '~/components/line-row';
import { LogView } from '~/components/log-view';
import { TaskBadge } from '~/components/task-badge';
import { useFilter, useHighlighter, usePreferences } from '~/hooks/use-filter';
import { useFollow } from '~/hooks/use-follow';
import { useSessions } from '~/hooks/use-sessions';
import { compileFilter, passes } from '~/lib/filter';
import { bytes } from '~/lib/format';
import { trpc, useTRPC } from '~/lib/trpc';
import type { Line } from '~/lib/types';

export const Route = createFileRoute('/file')({
  validateSearch: z.object({ path: z.string().min(1) }),
  component: FilePage,
});

function FilePage() {
  const { path } = Route.useSearch();
  const t = useTRPC();
  const qc = useQueryClient();
  const { data: projects } = useSessions();
  const source = projects?.flatMap(p => p.sessions).flatMap(s => s.sources).find(f => f.id === path) ?? null;
  const task = source?.taskId ? projects?.flatMap(p => p.sessions).flatMap(s => s.tasks).find(x => x.id === source.taskId) : null;

  const prefs = usePreferences();
  const { isFollowed, toggle } = useFollow();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) toggle(path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path, toggle]);
  const [lines, setLines] = useState<Line[]>([]);
  const [offset, setOffset] = useState<number | null>(null); // null until the paged read is done
  const [size, setSize] = useState(0);
  const [follow, setFollow] = useState(true);
  const [wrapOverride, setWrapOverride] = useState<boolean | null>(null);
  const wrap = wrapOverride ?? prefs.wrap; // the preference until the page's button says otherwise
  const [readError, setReadError] = useState<string | null>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    seen.current = new Set();
    setLines([]);
    setOffset(null);
    setReadError(null);
    (async () => {
      let from = 0;
      let n = 1;
      try {
        for (;;) {
          const page = await qc.fetchQuery(trpc.files.read.queryOptions({ path, offset: from, maxBytes: 1024 * 1024 }));
          if (cancelled) return;
          if (from === 0 && page.firstLineNumber > 0) n = page.firstLineNumber;
          const now = Date.now();
          const got = page.lines.map(s => ({ n: n++, t: now, s }));
          for (const l of got) seen.current.add(l.n);
          setLines(prev => prev.concat(got));
          setSize(page.size);
          from = page.nextOffset;
          if (page.eof) break;
        }
        setOffset(from);
      } catch (e) {
        if (!cancelled) setReadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, qc]);

  useSubscription(
    t.stream.file.subscriptionOptions(
      { path, afterOffset: offset ?? 0 },
      {
        enabled: offset !== null,
        onData(fresh: Line[]) {
          const add = fresh.filter(l => l.n === 0 || !seen.current.has(l.n));
          for (const l of add) if (l.n) seen.current.add(l.n);
          if (add.length) setLines(prev => prev.concat(add));
        },
      },
    ),
  );

  const { filter: f } = useFilter();
  const text = useHighlighter();
  const shown = useMemo(() => {
    const re = compileFilter(f);
    return re && f.mode !== 'highlight' ? lines.filter(l => passes(l.s, f, re)) : lines;
  }, [lines, f]);
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
        <BackLink />
        {source && (
          <Link to="/sessions/$project/$session" params={{ project: source.project, session: source.session }} className="text-blue-700 hover:underline">
            session
          </Link>
        )}
        <span className="truncate font-mono text-gray-800" title={path}>{source?.name ?? path}</span>
        {task && <TaskBadge status={task.status} exitCode={task.exitCode} />}
        {task?.description && <span className="truncate text-gray-500">{task.description}</span>}
        <span>· {source?.kind === 'command' || source?.kind === 'mcp' ? `${size} line(s) held` : bytes(size)}</span>
        <span>· {lines.length} line(s)</span>
        {shown.length !== lines.length && <span>· {shown.length} shown</span>}
        {readError ? <span className="text-red-700">· {readError}</span> : offset === null && <span>· reading…</span>}
        {source?.gone && <span className="text-amber-700">· file gone; showing what was read</span>}
        <span className="flex-1" />
        <button className={`rounded border px-2 py-0.5 ${wrap ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`} onClick={() => setWrapOverride(!wrap)}>wrap</button>
        <button
          className={`rounded border px-2 py-0.5 ${isFollowed(path) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
          onClick={() => toggle(path)}
          title="tail this file in the follow panel"
        >
          {isFollowed(path) ? 'unfollow (f)' : 'follow (f)'}
        </button>
        <button className={`rounded border px-2 py-0.5 ${follow ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`} onClick={() => setFollow(!follow)}>
          auto-scroll (G)
        </button>
      </div>
      <LogView
        rows={shown}
        rowKey={l => `${l.n}:${l.t}`}
        render={l => <LineRow line={l} source={null} showNumber showTime={prefs.show_time} showFile={false} text={text} />}
        follow={follow}
        onFollow={setFollow}
        wrap={wrap}
      />
    </>
  );
}
