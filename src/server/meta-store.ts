import type { Task } from '../lib/types';
import { db } from './store';
import { PARSER_VERSION, type ParserState, type SessionMeta } from './transcripts';

db.exec(`
CREATE TABLE IF NOT EXISTS session_meta (
  project      TEXT NOT NULL,
  session      TEXT NOT NULL,
  title        TEXT,
  first_prompt TEXT,
  branch       TEXT,
  cwd          TEXT,
  started_at   INTEGER,
  version      TEXT,
  PRIMARY KEY (project, session)
);
CREATE TABLE IF NOT EXISTS task_meta (
  project     TEXT NOT NULL,
  session     TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  tool_use_id TEXT,
  tool        TEXT NOT NULL,
  description TEXT NOT NULL,
  command     TEXT NOT NULL,
  log_path    TEXT,
  output_file TEXT,
  started_at  INTEGER,
  ended_at    INTEGER,
  status      TEXT NOT NULL,
  exit_code   INTEGER,
  summary     TEXT,
  PRIMARY KEY (project, session, task_id)
);
CREATE TABLE IF NOT EXISTS transcript_offset (
  project        TEXT NOT NULL,
  session        TEXT NOT NULL,
  bytes_read     INTEGER NOT NULL,
  pending        TEXT NOT NULL DEFAULT '{}',
  parser_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project, session)
)`);

export function loadSessionMeta(project: string, session: string): SessionMeta {
  const r = db
    .prepare('SELECT title, first_prompt, branch, cwd, started_at, version FROM session_meta WHERE project = ? AND session = ?')
    .get(project, session) as
    | { title: string | null; first_prompt: string | null; branch: string | null; cwd: string | null; started_at: number | null; version: string | null }
    | undefined;
  return {
    project, session, title: r?.title ?? null, firstPrompt: r?.first_prompt ?? null, branch: r?.branch ?? null,
    cwd: r?.cwd ?? null, startedAt: r?.started_at ?? null, version: r?.version ?? null,
  };
}

export function saveSessionMeta(m: SessionMeta): void {
  db.prepare(`
    INSERT INTO session_meta (project, session, title, first_prompt, branch, cwd, started_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project, session) DO UPDATE SET title = excluded.title, first_prompt = excluded.first_prompt,
      branch = excluded.branch, cwd = excluded.cwd, started_at = excluded.started_at, version = excluded.version`)
    .run(m.project, m.session, m.title, m.firstPrompt, m.branch, m.cwd, m.startedAt, m.version);
}

export function loadTasks(project: string, session: string): Task[] {
  return (db.prepare('SELECT * FROM task_meta WHERE project = ? AND session = ?').all(project, session) as Record<string, unknown>[]).map(r => ({
    id: r.task_id as string, project, session, toolUseId: (r.tool_use_id as string | null) ?? null, tool: r.tool as string,
    description: r.description as string, command: r.command as string, logPath: (r.log_path as string | null) ?? null,
    outputFile: (r.output_file as string | null) ?? null, startedAt: (r.started_at as number | null) ?? null,
    endedAt: (r.ended_at as number | null) ?? null, status: r.status as Task['status'], exitCode: (r.exit_code as number | null) ?? null,
    summary: (r.summary as string | null) ?? null,
  }));
}

export function saveTask(t: Task): void {
  db.prepare(`
    INSERT INTO task_meta (project, session, task_id, tool_use_id, tool, description, command, log_path, output_file,
      started_at, ended_at, status, exit_code, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project, session, task_id) DO UPDATE SET tool_use_id = excluded.tool_use_id, tool = excluded.tool,
      description = excluded.description, command = excluded.command, log_path = excluded.log_path,
      output_file = excluded.output_file, started_at = excluded.started_at, ended_at = excluded.ended_at,
      status = excluded.status, exit_code = excluded.exit_code, summary = excluded.summary`)
    .run(t.project, t.session, t.id, t.toolUseId, t.tool, t.description, t.command, t.logPath, t.outputFile,
      t.startedAt, t.endedAt, t.status, t.exitCode, t.summary);
}

/** the stored state; a state written by another parser version is dropped with the session's tasks, so the transcript is read again */
export function loadParserState(project: string, session: string): ParserState {
  const r = db.prepare('SELECT bytes_read, pending, parser_version FROM transcript_offset WHERE project = ? AND session = ?').get(project, session) as
    | { bytes_read: number; pending: string; parser_version: number }
    | undefined;
  if (!r) return { offset: 0, pending: {} };
  if (r.parser_version !== PARSER_VERSION) {
    db.prepare('DELETE FROM task_meta WHERE project = ? AND session = ?').run(project, session);
    db.prepare('DELETE FROM transcript_offset WHERE project = ? AND session = ?').run(project, session);
    return { offset: 0, pending: {} };
  }
  try {
    return { offset: r.bytes_read, pending: JSON.parse(r.pending) };
  } catch {
    return { offset: r.bytes_read, pending: {} };
  }
}

export function saveParserState(project: string, session: string, s: ParserState): void {
  db.prepare(`
    INSERT INTO transcript_offset (project, session, bytes_read, pending, parser_version) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (project, session) DO UPDATE SET bytes_read = excluded.bytes_read, pending = excluded.pending,
      parser_version = excluded.parser_version`)
    .run(project, session, s.offset, JSON.stringify(s.pending), PARSER_VERSION);
}

db.exec(`
CREATE TABLE IF NOT EXISTS session_tag (
  project TEXT NOT NULL,
  session TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (project, session)
)`);

export function loadTag(project: string, session: string): string | null {
  const r = db.prepare('SELECT tag FROM session_tag WHERE project = ? AND session = ?').get(project, session) as { tag: string } | undefined;
  return r?.tag ?? null;
}

/** the tag given; null or blank removes it */
export function saveTag(project: string, session: string, tag: string | null): void {
  if (tag && tag.trim()) {
    db.prepare(`
      INSERT INTO session_tag (project, session, tag) VALUES (?, ?, ?)
      ON CONFLICT (project, session) DO UPDATE SET tag = excluded.tag`).run(project, session, tag.trim());
  } else {
    db.prepare('DELETE FROM session_tag WHERE project = ? AND session = ?').run(project, session);
  }
}
