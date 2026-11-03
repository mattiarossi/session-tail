import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useEffect, useRef } from 'react';

export interface LogViewProps<R> {
  rows: R[];
  rowKey: (r: R, i: number) => string;
  render: (r: R, i: number) => ReactNode;
  follow: boolean;
  onFollow: (follow: boolean) => void;
  wrap: boolean;
  /** answer g and G (the page's view does; the follow panel's does not) */
  keys?: boolean;
}

export function LogView<R>({ rows, rowKey, render, follow, onFollow, wrap, keys = true }: LogViewProps<R>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 15,
    overscan: 40,
  });

  useEffect(() => {
    if (follow && rows.length > 0) v.scrollToIndex(rows.length - 1, { align: 'end' });
  }, [rows.length, follow, v]);

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'G') {
        v.scrollToIndex(rows.length - 1, { align: 'end' });
        onFollow(true);
      }
      if (e.key === 'g') {
        v.scrollToIndex(0);
        onFollow(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, onFollow, rows.length, v]);

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (atEnd !== follow) onFollow(atEnd);
  };

  return (
    <div ref={parentRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-white">
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map(item => (
          <div
            key={rowKey(rows[item.index], item.index)}
            data-index={item.index}
            ref={v.measureElement}
            className={`log-line ${wrap ? 'wrap' : ''}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
          >
            {render(rows[item.index], item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
