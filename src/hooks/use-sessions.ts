import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useMemo } from 'react';

import { shortId } from '~/lib/format';
import { useTRPC } from '~/lib/trpc';
import type { ProjectSummary, SessionSummary } from '~/lib/types';

export function useSessions() {
  const t = useTRPC();
  const qc = useQueryClient();
  const query = useQuery(t.sessions.list.queryOptions());
  useSubscription(
    t.sessions.changes.subscriptionOptions(undefined, {
      onData(s: SessionSummary) {
        qc.setQueryData<ProjectSummary[]>(t.sessions.list.queryKey(), old => {
          if (!old) return old;
          const projects = old.map(p => ({ ...p, sessions: [...p.sessions] }));
          let p = projects.find(x => x.project === s.project);
          if (!p) {
            p = { project: s.project, label: s.projectLabel, sessions: [] };
            projects.push(p);
          }
          const i = p.sessions.findIndex(x => x.key === s.key);
          if (i >= 0) p.sessions[i] = s;
          else p.sessions.push(s);
          p.sessions.sort((a, b) => b.lastActivity - a.lastActivity);
          return projects;
        });
      },
    }),
  );
  return query;
}

/** the label a session's chip shows: its tag, else the short id */
export function useSessionLabel(): (project: string, session: string) => string {
  const t = useTRPC();
  const { data } = useQuery(t.sessions.list.queryOptions());
  const tags = useMemo(
    () => new Map((data ?? []).flatMap(p => p.sessions).filter(s => s.tag).map(s => [s.key, s.tag as string])),
    [data],
  );
  return (project, session) => tags.get(`${project}/${session}`) ?? shortId(session);
}

/** sets a session's tag; the answer goes straight into the session page's query, the list follows through `sessions.changes` */
export function useSetTag() {
  const t = useTRPC();
  const qc = useQueryClient();
  return useMutation(
    t.sessions.setTag.mutationOptions({
      onSuccess: s => {
        if (s) qc.setQueryData(t.sessions.get.queryKey({ project: s.project, session: s.session }), s);
      },
    }),
  );
}
