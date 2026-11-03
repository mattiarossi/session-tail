import { useState } from 'react';

import { useSetTag } from '~/hooks/use-sessions';
import { chipClass, shortId } from '~/lib/format';
import type { SessionSummary } from '~/lib/types';

/** the session's chip: its tag or short id; a click opens the tag for editing (Enter saves, Escape cancels, empty clears) */
export function TagChip({ s }: { s: SessionSummary }) {
  const set = useSetTag();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(s.tag ?? '');
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        maxLength={24}
        placeholder="tag"
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            set.mutate({ project: s.project, session: s.session, tag: value });
            setEditing(false);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="w-28 rounded border border-blue-300 px-1 font-mono text-[11px]"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setValue(s.tag ?? '');
        setEditing(true);
      }}
      title={`${s.session} · click to tag`}
      className={`rounded px-1 font-mono ${chipClass(s.key)}`}
    >
      {s.tag ?? shortId(s.session)}
    </button>
  );
}
