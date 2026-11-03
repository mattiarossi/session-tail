import { useEffect, useRef } from 'react';

import { useFilter } from '~/hooks/use-filter';
import { type Filter, filterPattern } from '~/lib/filter';

export function FilterBar() {
  const { filter, setFilter } = useFilter();
  const box = useRef<HTMLInputElement>(null);
  const invalid = filter.text !== '' && filterPattern(filter) === null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        box.current?.focus();
      }
      if (e.key === 'Escape' && e.target === box.current) {
        setFilter(prev => ({ ...prev, text: '' }));
        box.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setFilter]);

  const set = (patch: Partial<Filter>) => setFilter(prev => ({ ...prev, ...patch }));
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <input
        ref={box}
        value={filter.text}
        onChange={e => set({ text: e.target.value })}
        placeholder="filter ( / )"
        className={`w-72 rounded border px-2 py-1 font-mono ${invalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
        title={invalid ? 'the regular expression does not compile' : 'text, or a regular expression with .* on'}
      />
      <Toggle on={filter.regex} onClick={() => set({ regex: !filter.regex })} title="regular expression">.*</Toggle>
      <Toggle on={filter.caseSensitive} onClick={() => set({ caseSensitive: !filter.caseSensitive })} title="case sensitive">Aa</Toggle>
      <select value={filter.mode} onChange={e => set({ mode: e.target.value as Filter['mode'] })} className="rounded border border-gray-300 px-1 py-1">
        <option value="highlight">highlight</option>
        <option value="only">matching lines only</option>
        <option value="exclude">exclude matching</option>
      </select>
    </div>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`rounded border px-1.5 py-1 font-mono ${on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500'}`}>
      {children}
    </button>
  );
}
