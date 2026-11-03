import { DEFAULT_RULES, HighlightRule } from '../lib/rules';
import { db } from './store';

db.exec(`
CREATE TABLE IF NOT EXISTS highlight_rule (
  id             TEXT PRIMARY KEY,
  pattern        TEXT NOT NULL,
  regex          INTEGER NOT NULL DEFAULT 1,
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  color          TEXT NOT NULL,
  scope          TEXT NOT NULL DEFAULT 'match',
  enabled        INTEGER NOT NULL DEFAULT 1,
  position       INTEGER NOT NULL DEFAULT 0
)`);

/** the defaults the store lacks, by id: the whole set on an empty store, a new default later */
export function seedRules(): number {
  const have = new Set((db.prepare('SELECT id FROM highlight_rule').all() as { id: string }[]).map(r => r.id));
  let n = 0;
  for (const r of DEFAULT_RULES) {
    if (have.has(r.id)) continue;
    saveRule(r);
    n++;
  }
  return n;
}

export function listRules(): HighlightRule[] {
  return (db.prepare('SELECT * FROM highlight_rule ORDER BY position, id').all() as Record<string, unknown>[]).map(r =>
    HighlightRule.parse({
      id: r.id, pattern: r.pattern, regex: r.regex === 1, caseSensitive: r.case_sensitive === 1, color: r.color,
      scope: r.scope, enabled: r.enabled === 1, position: r.position,
    }),
  );
}

export function saveRule(r: HighlightRule): void {
  db.prepare(`
    INSERT INTO highlight_rule (id, pattern, regex, case_sensitive, color, scope, enabled, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET pattern = excluded.pattern, regex = excluded.regex, case_sensitive = excluded.case_sensitive,
      color = excluded.color, scope = excluded.scope, enabled = excluded.enabled, position = excluded.position`)
    .run(r.id, r.pattern, r.regex ? 1 : 0, r.caseSensitive ? 1 : 0, r.color, r.scope, r.enabled ? 1 : 0, r.position);
}

export function deleteRule(id: string): void {
  db.prepare('DELETE FROM highlight_rule WHERE id = ?').run(id);
}

/** every rule replaced by the default set */
export function resetRules(): HighlightRule[] {
  db.exec('DELETE FROM highlight_rule');
  seedRules();
  return listRules();
}
