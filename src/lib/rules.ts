import { z } from 'zod';

export const RuleColor = z.enum(['red', 'green', 'amber', 'blue', 'purple', 'gray']);
export type RuleColor = z.infer<typeof RuleColor>;

export const HighlightRule = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  /** a regular expression (true) or plain text */
  regex: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  color: RuleColor,
  /** colour the match, or the whole line */
  scope: z.enum(['match', 'line']).default('match'),
  enabled: z.boolean().default(true),
  position: z.number().int().default(0),
});
export type HighlightRule = z.infer<typeof HighlightRule>;

/** the rules the store is seeded with when it has none */
export const DEFAULT_RULES: HighlightRule[] = [
  { id: 'fail', pattern: '\\b(FAIL(ED)?|ERROR|Error|error|REFUSED|refused|exception|Exception|fatal)\\b', regex: true, caseSensitive: true, color: 'red', scope: 'match', enabled: true, position: 1 },
  { id: 'exit', pattern: '\\bexit(?: code)? [1-9]\\d*\\b', regex: true, caseSensitive: false, color: 'red', scope: 'line', enabled: true, position: 2 },
  { id: 'pass', pattern: '\\b(PASS(ED)?|OK|done|completed)\\b', regex: true, caseSensitive: true, color: 'green', scope: 'match', enabled: true, position: 3 },
  { id: 'warn', pattern: '\\b(SKIP(PED)?|WARN(ING)?|warning|deprecated)\\b', regex: true, caseSensitive: false, color: 'amber', scope: 'match', enabled: true, position: 4 },
  { id: 'step', pattern: '^== ', regex: true, caseSensitive: true, color: 'blue', scope: 'line', enabled: true, position: 5 },
  { id: 'run', pattern: '^(cpr-run|rmp-run) ·', regex: true, caseSensitive: true, color: 'purple', scope: 'line', enabled: true, position: 6 },
  { id: 'cmd', pattern: '^>> ', regex: true, caseSensitive: true, color: 'blue', scope: 'line', enabled: true, position: 7 },
];

export const MATCH_CLASS: Record<RuleColor, string> = {
  red: 'bg-red-100 text-red-800 rounded-sm',
  green: 'bg-green-100 text-green-800 rounded-sm',
  amber: 'bg-amber-100 text-amber-800 rounded-sm',
  blue: 'bg-blue-100 text-blue-800 rounded-sm',
  purple: 'bg-purple-100 text-purple-800 rounded-sm',
  gray: 'bg-gray-200 text-gray-700 rounded-sm',
};
export const LINE_CLASS: Record<RuleColor, string> = {
  red: 'text-red-700',
  green: 'text-green-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700 font-semibold',
  purple: 'text-purple-700 font-semibold',
  gray: 'text-gray-400',
};

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CompiledRule {
  rule: HighlightRule;
  re: RegExp;
}

/** the enabled rules compiled, in position order; a rule whose pattern does not compile is skipped */
export function compileRules(rules: HighlightRule[]): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const rule of [...rules].filter(r => r.enabled).sort((a, b) => a.position - b.position)) {
    try {
      out.push({ rule, re: new RegExp(rule.regex ? rule.pattern : escapeRegex(rule.pattern), rule.caseSensitive ? 'g' : 'gi') });
    } catch {
      // shown on the preferences page as invalid
    }
  }
  return out;
}
