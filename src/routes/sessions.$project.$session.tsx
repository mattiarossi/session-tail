import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

import { BackLink } from '~/components/back-link';
import { TagChip } from '~/components/tag-chip';
import { TaskBadge } from '~/components/task-badge';
import { useFollow } from '~/hooks/use-follow';
import { useSessions } from '~/hooks/use-sessions';
import { bytes, clock, duration, timeAgo } from '~/lib/format';
import { useTRPC } from '~/lib/trpc';

export const Route = createFileRoute('/sessions/$project/$session')({ component: SessionPage });

function SessionPage() {
  const { project, session } = Route.useParams();
  const t = useTRPC();
  useSessions(); // keeps the list, and through it this page, live
  const { isFollowed, toggle } = useFollow();
  const { data: s, isLoading } = useQuery({ ...t.sessions.get.queryOptions({ project, session }), refetchInterval: 5000 });
  if (isLoading) return <p className="p-6 text-sm text-gray-500">reading…</p>;
  if (!s) return <p className="p-6 text-sm text-gray-500">no such session</p>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-2">
        <BackLink />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">{s.title ?? s.firstPrompt ?? s.session}</h1>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <TagChip s={s} />
        <span className="text-gray-400">click the chip to tag this session; the tag replaces the id in the stream and the panel</span>
      </div>
      <p className="mt-1 font-mono text-xs text-gray-500">
        {s.session} · {s.branch ?? '-'} · {s.cwd ?? s.project} · {timeAgo(s.lastActivity)}
      </p>
      {s.firstPrompt && s.title && <p className="mt-2 text-sm text-gray-600">{s.firstPrompt}</p>}

      <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Tasks</h2>
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr><th className="py-1 pr-3">status</th><th className="pr-3">started</th><th className="pr-3">took</th><th className="pr-3">description</th><th>files</th></tr>
        </thead>
        <tbody>
          {s.tasks.map(t => (
            <tr key={t.id} className="border-t border-gray-100 align-top">
              <td className="py-1 pr-3"><TaskBadge status={t.status} exitCode={t.exitCode} /></td>
              <td className="pr-3 font-mono text-gray-500">{t.startedAt ? clock(t.startedAt) : '-'}</td>
              <td className="pr-3 text-gray-500">{duration(t.startedAt, t.endedAt)}</td>
              <td className="pr-3">
                <div className="text-gray-800">{t.description || <span className="text-gray-400">(no description)</span>}</div>
                <details className="text-gray-500"><summary className="cursor-pointer">command</summary><pre className="whitespace-pre-wrap break-all">{t.command}</pre></details>
                {t.summary && <div className="text-gray-500">{t.summary}</div>}
              </td>
              <td className="font-mono">
                {s.sources
                  .filter(f => f.taskId === t.id)
                  .map(f => <FileLink key={f.id} path={f.id} label={f.kind === 'task' ? 'output' : 'log'} />)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Files</h2>
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr><th className="py-1 pr-3">kind</th><th className="pr-3">file</th><th className="pr-3">size</th><th className="pr-3">changed</th><th>task</th></tr>
        </thead>
        <tbody>
          {s.sources.map(f => (
            <tr key={f.id} className={`border-t border-gray-100 ${f.gone ? 'text-gray-400' : ''}`}>
              <td className="py-1 pr-3">{f.kind}</td>
              <td className="pr-3 font-mono">
                <FileLink path={f.id} label={f.name} />
                {f.gone ? ' (gone)' : ''}
                <button
                  onClick={() => toggle(f.id)}
                  className={`ml-2 rounded border px-1 text-[10px] ${isFollowed(f.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                  title="tail this file in the follow panel"
                >
                  {isFollowed(f.id) ? 'unfollow' : 'follow'}
                </button>
              </td>
              <td className="pr-3">{f.kind === 'command' || f.kind === 'mcp' ? `${f.size} line(s)` : bytes(f.size)}</td>
              <td className="pr-3">{timeAgo(f.mtime)}</td>
              <td className="font-mono">{f.taskId ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileLink({ path, label }: { path: string; label: string }) {
  return (
    <Link to="/file" search={{ path }} className="mr-2 text-blue-700 hover:underline" title={path}>
      {label}
    </Link>
  );
}
