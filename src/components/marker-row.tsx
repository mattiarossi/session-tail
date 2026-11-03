import { Link } from '@tanstack/react-router';

import { useSessionLabel } from '~/hooks/use-sessions';
import { chipClass, clock } from '~/lib/format';
import type { Source } from '~/lib/types';

/** the thin row that stamps a burst of output: the time, the session chip, the file */
export function MarkerRow({ t, source }: { t: number; source: Source | null }) {
  const label = useSessionLabel();
  return (
    <div className="flex select-none items-center gap-2 px-2 pt-1 text-[10px] text-gray-400">
      <span className="h-px w-6 bg-gray-200" />
      <span className="whitespace-nowrap">{clock(t)}</span>
      {source && (
        <>
          <Link
            to="/sessions/$project/$session"
            params={{ project: source.project, session: source.session }}
            className={`whitespace-nowrap rounded px-1 ${chipClass(`${source.project}/${source.session}`)}`}
            title={`${source.project}/${source.session}`}
          >
            {label(source.project, source.session)}
          </Link>
          <Link to="/file" search={{ path: source.id }} className="truncate hover:underline" title={source.id}>
            {source.name.replace(/^(scratchpad|tasks|tool-results)\//, '')}
          </Link>
        </>
      )}
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
