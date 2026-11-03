import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';

import { TagChip } from '~/components/tag-chip';
import { TaskBadge } from '~/components/task-badge';
import { chipClass, shortId, timeAgo } from '~/lib/format';
import type { SessionSummary } from '~/lib/types';

import { usePreferences } from '~/hooks/use-filter';
import { useSessions } from '~/hooks/use-sessions';

export function Sidebar() {
  const { data, isLoading, error } = useSessions();
  const prefs = usePreferences();
  const search = useSearch({ strict: false }) as { s?: string[] };
  const navigate = useNavigate();
  const selected = new Set(search.s ?? []);
  const [showIdle, setShowIdle] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void navigate({ to: '/', search: prev => ({ ...prev, s: next.size ? [...next] : undefined }) });
  };

  if (isLoading) return <p className="p-4 text-sm text-gray-500">reading sessions…</p>;
  if (error) return <p className="p-4 text-sm text-red-700">{error.message}</p>;
  const now = Date.now();
  return (
    <div className="py-2">
      {data?.map(p => {
        // a session with no transcript and nothing but hook outputs is a chat opened and left: it folds with the idle ones
        const empty = (s: SessionSummary) => !s.transcript && s.sources.every(f => f.kind === 'tool-result' || f.kind === 'command' || f.kind === 'mcp');
        const recent = p.sessions.filter(s => !empty(s) && (s.active || now - s.lastActivity < prefs.idle_hours * 3_600_000));
        const idle = p.sessions.filter(s => !recent.includes(s));
        const open = showIdle[p.project] ?? false;
        return (
          <section key={p.project} className="mb-3">
            <h2 className="truncate px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500" title={p.project}>
              {p.label}
            </h2>
            {(open ? p.sessions : recent).map(s => (
              <SessionRow key={s.key} s={s} selected={selected.has(s.key)} onToggle={() => toggle(s.key)} />
            ))}
            {idle.length > 0 && (
              <button
                className="w-full px-3 py-1 text-left text-xs text-gray-400 hover:text-gray-700"
                onClick={() => setShowIdle(v => ({ ...v, [p.project]: !open }))}
              >
                {open ? 'hide' : 'show'} {idle.length} idle session(s)
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SessionRow({ s, selected, onToggle }: { s: SessionSummary; selected: boolean; onToggle: () => void }) {
  const running = s.tasks.filter(t => t.status === 'running');
  const failed = s.tasks.filter(t => t.status === 'failed' || (t.exitCode ?? 0) > 0);
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 ${selected ? 'bg-blue-50' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" title="include in the stream" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${s.active ? 'bg-green-500' : 'bg-gray-300'}`} title={s.active ? 'active' : 'idle'} />
          <Link
            to="/sessions/$project/$session"
            params={{ project: s.project, session: s.session }}
            className="truncate text-sm font-medium text-gray-800 hover:underline"
            title={s.title ?? s.firstPrompt ?? s.session}
          >
            {s.title ?? s.firstPrompt ?? (s.transcript ? shortId(s.session) : 'no transcript')}
          </Link>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
          <TagChip s={s} />
          {s.branch && <span className="truncate font-mono" title={s.branch}>{s.branch.replace(/^feature\//, '')}</span>}
          <span>{timeAgo(s.lastActivity)}</span>
          {running.length > 0 && <TaskBadge status="running" count={running.length} />}
          {failed.length > 0 && <TaskBadge status="failed" count={failed.length} />}
        </div>
        {running.map(t => (
          <div key={t.id} className="mt-0.5 truncate text-[11px] text-gray-600" title={t.command}>
            ▸ {t.description || t.command.slice(0, 80)}
          </div>
        ))}
      </div>
    </div>
  );
}
