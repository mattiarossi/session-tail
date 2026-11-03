import { DEFAULT_PREFERENCES, PREFERENCE_KEYS, Preferences } from '../lib/preferences';
import { db } from './store';

db.exec(`
CREATE TABLE IF NOT EXISTS preference (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)`);

/** the stored preferences over the defaults; a stored value that no longer parses (a key's type changed) reads as the default */
export function getPreferences(): Preferences {
  const out: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const r of db.prepare('SELECT key, value FROM preference').all() as { key: string; value: string }[]) {
    if (!(PREFERENCE_KEYS as string[]).includes(r.key)) continue;
    try {
      const v = Preferences.shape[r.key as keyof Preferences].safeParse(JSON.parse(r.value));
      if (v.success) out[r.key] = v.data;
    } catch {
      // unreadable JSON: the default stands
    }
  }
  return out as Preferences;
}

/** the keys given, each one row; the others untouched */
export function setPreferences(patch: Partial<Preferences>): Preferences {
  const upsert = db.prepare(`
    INSERT INTO preference (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const key of PREFERENCE_KEYS) {
    if (patch[key] !== undefined) upsert.run(key, JSON.stringify(patch[key]));
  }
  return getPreferences();
}

/** every key back to its default */
export function resetPreferences(): Preferences {
  db.exec('DELETE FROM preference');
  return getPreferences();
}
