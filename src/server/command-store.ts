import type { CommandRun } from '../lib/types';
import { db } from './store';

/** commands kept per session; older rows go when a newer one is saved */
export const COMMANDS_KEPT = 200;

db.exec(`
CREATE TABLE IF NOT EXISTS command_run (
  project        TEXT NOT NULL,
  session        TEXT NOT NULL,
  tool_use_id    TEXT NOT NULL,
  description    TEXT NOT NULL,
  command        TEXT NOT NULL,
  started_at     INTEGER,
  ended_at       INTEGER,
  is_error       INTEGER NOT NULL DEFAULT 0,
  output         TEXT NOT NULL,
  persisted_file TEXT,
  tool           TEXT NOT NULL DEFAULT 'Bash',
  PRIMARY KEY (project, session, tool_use_id)
)`);
// a store written before the column existed
if (!(db.prepare('PRAGMA table_info(command_run)').all() as { name: string }[]).some(c => c.name === 'tool')) {
  db.exec("ALTER TABLE command_run ADD COLUMN tool TEXT NOT NULL DEFAULT 'Bash'");
}

/** the two kinds the table holds, by the tool's name */
const isMcp = (tool: string) => tool.startsWith('mcp__');

export function loadCommands(project: string, session: string): CommandRun[] {
  return (
    db
      .prepare(`SELECT * FROM command_run WHERE project = ? AND session = ? ORDER BY ended_at, rowid`)
      .all(project, session) as Record<string, unknown>[]
  ).map(r => ({
    toolUseId: r.tool_use_id as string, project, session, tool: (r.tool as string) ?? 'Bash', description: r.description as string, command: r.command as string,
    startedAt: (r.started_at as number | null) ?? null, endedAt: (r.ended_at as number | null) ?? null, isError: r.is_error === 1,
    output: r.output as string, persistedFile: (r.persisted_file as string | null) ?? null,
  }));
}

export function saveCommand(c: CommandRun): void {
  db.prepare(`
    INSERT INTO command_run (project, session, tool_use_id, description, command, started_at, ended_at, is_error, output, persisted_file, tool)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project, session, tool_use_id) DO UPDATE SET ended_at = excluded.ended_at, is_error = excluded.is_error,
      output = excluded.output, persisted_file = excluded.persisted_file, tool = excluded.tool`)
    .run(c.project, c.session, c.toolUseId, c.description, c.command, c.startedAt, c.endedAt, c.isError ? 1 : 0, c.output, c.persistedFile, c.tool);
  const mcp = isMcp(c.tool) ? 1 : 0;
  db.prepare(`
    DELETE FROM command_run WHERE project = ? AND session = ? AND (tool LIKE 'mcp\\_\\_%' ESCAPE '\\') = ? AND rowid NOT IN (
      SELECT rowid FROM command_run WHERE project = ? AND session = ? AND (tool LIKE 'mcp\\_\\_%' ESCAPE '\\') = ?
      ORDER BY ended_at DESC, rowid DESC LIMIT ${COMMANDS_KEPT})`)
    .run(c.project, c.session, mcp, c.project, c.session, mcp);
}
