import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useSessionLabel } from '~/hooks/use-sessions';
import { chipClass, clock } from '~/lib/format';
import type { Line, Source } from '~/lib/types';

export interface LineRowProps {
  line: Line;
  /** null in the focus view, where every line is the same file's */
  source: Source | null;
  showNumber: boolean;
  /** the time the collector read the line; off by default: every backfilled line carries the same one */
  showTime: boolean;
  /** the file name beside the session chip (the full path in its title) */
  showFile: boolean;
  text: (s: string) => ReactNode;
  /** the panel's rows: a click on the text opens the line's file */
  onClick?: () => void;
}

export function LineRow({ line, source, showNumber, showTime, showFile, text, onClick }: LineRowProps) {
  const label = useSessionLabel();
  return (
    <div className="flex gap-2 px-2 hover:bg-gray-50">
      {/* the fixed columns are sized in ch of the log font and never wrap, whatever the font and the wrap setting */}
      {showTime && <span className="w-[9ch] shrink-0 select-none whitespace-nowrap text-gray-400">{clock(line.t)}</span>}
      {source && (
        <>
          <Link
            to="/sessions/$project/$session"
            params={{ project: source.project, session: source.session }}
            className={`w-[12ch] shrink-0 truncate whitespace-nowrap rounded px-1 text-center ${chipClass(`${source.project}/${source.session}`)}`}
            title={`${source.project}/${source.session}`}
          >
            {label(source.project, source.session)}
          </Link>
          {showFile && (
            <Link to="/file" search={{ path: source.id }} className="w-[20ch] shrink-0 truncate whitespace-nowrap text-gray-500 hover:underline" title={source.id}>
              {source.name.replace(/^(scratchpad|tasks|tool-results)\//, '')}
            </Link>
          )}
        </>
      )}
      {showNumber && <span className="w-[7ch] shrink-0 select-none whitespace-nowrap text-right text-gray-400">{line.n || ''}</span>}
      <span className={`min-w-0 flex-1 ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick} title={onClick ? 'open this file' : undefined}>
        {text(line.s)}
      </span>
    </div>
  );
}
