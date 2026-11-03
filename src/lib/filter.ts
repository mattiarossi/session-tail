import { z } from 'zod';

import { type CompiledRule, LINE_CLASS, MATCH_CLASS, escapeRegex } from './rules';

export const Filter = z.object({
  text: z.string().default(''),
  regex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  /** highlight: every line, matches marked · only: matching lines · exclude: the others */
  mode: z.enum(['highlight', 'only', 'exclude']).default('highlight'),
});
export type Filter = z.infer<typeof Filter>;
export const EMPTY_FILTER: Filter = Filter.parse({});

/** the pattern the server gets; null when the filter is empty or does not compile */
export function filterPattern(f: Filter): string | null {
  if (!f.text) return null;
  const p = f.regex ? f.text : escapeRegex(f.text);
  try {
    new RegExp(p);
    return p;
  } catch {
    return null;
  }
}

export function compileFilter(f: Filter): RegExp | null {
  const p = filterPattern(f);
  return p === null ? null : new RegExp(p, f.caseSensitive ? 'g' : 'gi');
}

/** a line passes the filter's mode (highlight passes everything) */
export function passes(s: string, f: Filter, re: RegExp | null): boolean {
  if (!re || f.mode === 'highlight') return true;
  re.lastIndex = 0;
  const hit = re.test(s);
  return f.mode === 'only' ? hit : !hit;
}

export interface Span {
  text: string;
  className: string | null;
}

export interface Decorated {
  /** the class of the whole line, from the first line-scoped rule that matches */
  lineClass: string | null;
  spans: Span[];
}

const FILTER_CLASS = 'bg-yellow-300 text-gray-900 rounded-sm';

/**
 * The line cut into spans: the filter's matches first, then each rule's matches on the text the
 * earlier marks left free. Ranges never overlap: an earlier mark wins over a later one.
 */
export function decorate(s: string, filterRe: RegExp | null, rules: CompiledRule[]): Decorated {
  let lineClass: string | null = null;
  const marks: { start: number; end: number; className: string }[] = [];
  const free = (start: number, end: number) => marks.every(m => end <= m.start || start >= m.end);
  const collect = (re: RegExp, className: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (free(start, end)) marks.push({ start, end, className });
    }
  };
  if (filterRe) collect(filterRe, FILTER_CLASS);
  for (const { rule, re } of rules) {
    if (rule.scope === 'line') {
      re.lastIndex = 0;
      if (lineClass === null && re.test(s)) lineClass = LINE_CLASS[rule.color];
    } else {
      collect(re, MATCH_CLASS[rule.color]);
    }
  }
  if (marks.length === 0) return { lineClass, spans: [{ text: s, className: null }] };
  marks.sort((a, b) => a.start - b.start);
  const spans: Span[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) spans.push({ text: s.slice(at, m.start), className: null });
    spans.push({ text: s.slice(m.start, m.end), className: m.className });
    at = m.end;
  }
  if (at < s.length) spans.push({ text: s.slice(at), className: null });
  return { lineClass, spans };
}
