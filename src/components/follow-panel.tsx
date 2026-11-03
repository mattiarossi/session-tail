import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { LineRow } from '~/components/line-row';
import { LogView } from '~/components/log-view';
import { useHighlighter, usePreferencePatch, usePreferences } from '~/hooks/use-filter';
import { useFollow } from '~/hooks/use-follow';
import { useSessionLabel, useSessions } from '~/hooks/use-sessions';
import { useStream } from '~/hooks/use-stream';
import { chipClass } from '~/lib/format';
import { StreamFilter } from '~/lib/types';

/** the lines the panel keeps */
const PANEL_ROWS = 2000;
/** the buffered lines asked per followed file when the panel (re)subscribes */
const BACKFILL_PER_FILE = 100;

/**
 * The lower third of the main pane: the live tails of the followed files, merged, each line with the
 * time it arrived and its session chip (the file is named in the header's chips, not per line). A click on
 * a line's text opens its file in the main pane; a chip in the header opens the file too, its × unfollows.
 * `p` folds the panel to its header. Nothing followed: no panel.
 */
export function FollowPanel() {
  const { followed, toggle } = useFollow();
  const prefs = usePreferences();
  const navigate = useNavigate();
  const text = useHighlighter();
  const { data: projects } = useSessions();
  const labelOf = useSessionLabel();
  const [open, setOpen] = useState(true);
  const [tail, setTail] = useState(true);
  const patch = usePreferencePatch();
  // the height while a drag is on; the preference once it is saved (the effect below clears the override)
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const height = dragHeight ?? prefs.panel_height;
  useEffect(() => setDragHeight(null), [prefs.panel_height]);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const clamp = (h: number) => Math.max(100, Math.min(window.innerHeight - 160, Math.round(h)));
    const onMove = (ev: MouseEvent) => setDragHeight(clamp(startH + (startY - ev.clientY)));
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      patch({ panel_height: clamp(startH + (startY - ev.clientY)) });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const filter = StreamFilter.parse({
    files: followed,
    kinds: ['scratchpad', 'task', 'tool-result'],
    backfill: BACKFILL_PER_FILE * Math.max(1, followed.length),
  });
  const { rows, sources } = useStream(filter, PANEL_ROWS, followed.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) setOpen(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (followed.length === 0) return null;
  const known = new Map(projects?.flatMap(p => p.sessions).flatMap(s => s.sources).map(f => [f.id, f]) ?? []);
  const label = (path: string) => {
    const f = sources.get(path) ?? known.get(path);
    return f ? `${labelOf(f.project, f.session)} ${f.name.replace(/^(scratchpad|tasks|tool-results)\//, '')}` : path;
  };
  const openFile = (path: string) => void navigate({ to: '/file', search: { path } });
  return (
    <section className="flex shrink-0 flex-col border-t border-gray-300 bg-white" style={{ height: open ? height : undefined }}>
      {open && <div onMouseDown={startDrag} title="drag to resize" className="h-1.5 shrink-0 cursor-row-resize bg-gray-200 hover:bg-blue-300" />}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
        <button onClick={() => setOpen(!open)} className="rounded border border-gray-300 px-1.5 py-0.5 hover:bg-white" title="fold or unfold the followed tails (p)">
          {open ? '▾' : '▸'} following {followed.length}
        </button>
        {followed.map(path => {
          const f = sources.get(path) ?? known.get(path);
          return (
            <span key={path} className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono ${f ? chipClass(`${f.project}/${f.session}`) : 'bg-gray-200 text-gray-600'}`} title={path}>
              <button onClick={() => openFile(path)} className="hover:underline">{label(path)}</button>
              <button onClick={() => toggle(path)} title="unfollow" className="font-bold">×</button>
            </span>
          );
        })}
        <span className="flex-1" />
        <span>{rows.length} line(s)</span>
        <button className={`rounded border px-1.5 py-0.5 ${tail ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 hover:bg-white'}`} onClick={() => setTail(!tail)}>
          auto-scroll
        </button>
      </div>
      {open && (
        <LogView
          rows={rows}
          rowKey={r => r.key}
          render={r => (
            <LineRow
              line={r.line}
              source={sources.get(r.sourceId) ?? null}
              showNumber={false}
              showTime
              showFile={false}
              text={text}
              onClick={() => openFile(r.sourceId)}
            />
          )}
          follow={tail}
          onFollow={setTail}
          wrap={prefs.wrap}
          keys={false}
        />
      )}
    </section>
  );
}
