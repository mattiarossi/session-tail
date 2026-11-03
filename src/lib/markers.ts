import type { StreamRow } from '../hooks/use-stream';

/** a pause longer than this between two lines of one source opens a new marker */
export const MARKER_GAP_MS = 5000;

/** the lines a collapsed burst keeps */
export const COLLAPSED_LINES = 3;

export type DisplayRow =
  | { kind: 'line'; row: StreamRow }
  | { kind: 'marker'; key: string; t: number; sourceId: string }
  /** the rest of a collapsed burst: a click expands it */
  | { kind: 'ellipsis'; key: string; burstKey: string; hidden: number }
  /** the end of an expanded burst: a click collapses it */
  | { kind: 'collapse'; key: string; burstKey: string };

export interface DisplayOptions {
  /** a marker row before each burst */
  markers: boolean;
  /** bursts longer than COLLAPSED_LINES fold, the newest excepted */
  collapse: boolean;
  /** the bursts the user expanded, by their first row's key */
  expanded: ReadonlySet<string>;
}

/** the rows in bursts: one source's consecutive lines, split where more than MARKER_GAP_MS pass */
export function bursts(rows: StreamRow[]): StreamRow[][] {
  const out: StreamRow[][] = [];
  let cur: StreamRow[] = [];
  let prevSource: string | null = null;
  let prevT = 0;
  for (const r of rows) {
    if (cur.length > 0 && (r.sourceId !== prevSource || r.line.t - prevT > MARKER_GAP_MS)) {
      out.push(cur);
      cur = [];
    }
    cur.push(r);
    prevSource = r.sourceId;
    prevT = r.line.t;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** a source whose bursts arrive complete (a command's or an MCP call's block), never line by line */
export function arrivesWhole(sourceId: string): boolean {
  return sourceId.startsWith('command:') || sourceId.startsWith('mcp:');
}

/**
 * The rows the stream shows: markers before bursts, long bursts folded to their first lines. The newest burst
 * stays whole when it is a file's, which grows line by line; a command's or an MCP call's block arrives complete
 * and folds at once.
 */
export function buildDisplay(rows: StreamRow[], o: DisplayOptions): DisplayRow[] {
  const out: DisplayRow[] = [];
  const all = bursts(rows);
  all.forEach((b, i) => {
    const key = b[0].key;
    if (o.markers) out.push({ kind: 'marker', key: `m:${key}`, t: b[0].line.t, sourceId: b[0].sourceId });
    const newest = i === all.length - 1 && !arrivesWhole(b[0].sourceId);
    const foldable = o.collapse && !newest && b.length > COLLAPSED_LINES;
    if (foldable && !o.expanded.has(key)) {
      for (const row of b.slice(0, COLLAPSED_LINES)) out.push({ kind: 'line', row });
      out.push({ kind: 'ellipsis', key: `e:${key}`, burstKey: key, hidden: b.length - COLLAPSED_LINES });
    } else {
      for (const row of b) out.push({ kind: 'line', row });
      if (foldable) out.push({ kind: 'collapse', key: `c:${key}`, burstKey: key });
    }
  });
  return out;
}
