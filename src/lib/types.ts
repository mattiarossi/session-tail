import { z } from 'zod';

export const SourceKind = z.enum(['scratchpad', 'task', 'tool-result', 'command', 'mcp']);
export type SourceKind = z.infer<typeof SourceKind>;

/** one line as the collector read it */
export interface Line {
  /** line number in the file, 1-based; 0 when the file was joined mid-way and the count is unknown */
  n: number;
  /** when the collector read it, ms since the epoch */
  t: number;
  s: string;
}

export interface Source {
  /** the absolute path */
  id: string;
  kind: SourceKind;
  project: string;
  session: string;
  /** the path under the session folder: scratchpad/foo.log, tasks/<id>.output, tool-results/<id>.txt */
  name: string;
  size: number;
  mtime: number;
  /** the file no longer exists; the buffered lines remain */
  gone: boolean;
  /** the task whose output or log this is */
  taskId: string | null;
}

export type TaskStatus = 'running' | 'completed' | 'failed' | 'killed' | 'unknown';

export interface Task {
  id: string;
  project: string;
  session: string;
  toolUseId: string | null;
  /** the tool that ran: Bash, Agent, … */
  tool: string;
  description: string;
  command: string;
  /** the file the command names with --log <path> or > <path>, when any */
  logPath: string | null;
  outputFile: string | null;
  startedAt: number | null;
  endedAt: number | null;
  status: TaskStatus;
  exitCode: number | null;
  summary: string | null;
}

/** a foreground command a session ran: the Bash call and its result, from the transcript */
export interface CommandRun {
  toolUseId: string;
  project: string;
  session: string;
  /** `Bash`, or the MCP tool's full name, `mcp__<server>__<tool>` */
  tool: string;
  /** the Bash call's description; for an MCP call, `<server> <tool>` */
  description: string;
  command: string;
  startedAt: number | null;
  endedAt: number | null;
  isError: boolean;
  /** the result's text; the saved file's content when the harness saved the output aside */
  output: string;
  persistedFile: string | null;
}

export interface SessionSummary {
  key: string;
  project: string;
  projectLabel: string;
  session: string;
  title: string | null;
  firstPrompt: string | null;
  branch: string | null;
  cwd: string | null;
  /** the transcript's mtime, or the newest source's */
  lastActivity: number;
  /** a task is running, or the transcript moved within the last ten minutes */
  active: boolean;
  /** the session has a transcript; without one (a chat opened and left) only its hook outputs exist */
  transcript: boolean;
  /** the user's tag, shown in place of the short id wherever the session is named */
  tag: string | null;
  tasks: Task[];
  sources: Source[];
}

export interface ProjectSummary {
  project: string;
  label: string;
  sessions: SessionSummary[];
}

export const StreamFilter = z.object({
  /** session keys to include; empty = every session */
  sessions: z.array(z.string()).default([]),
  kinds: z.array(SourceKind).default(['scratchpad', 'task', 'command', 'mcp']),
  /** source ids (paths) to follow; when named, the sessions and kinds above do not apply */
  files: z.array(z.string()).default([]),
  /** a regular expression a line must match to be sent */
  include: z.string().nullable().default(null),
  /** a regular expression a line must not match */
  exclude: z.string().nullable().default(null),
  caseSensitive: z.boolean().default(false),
  /** the buffered lines sent before the live ones, newest last */
  backfill: z.number().int().min(0).max(5000).default(500),
});
export type StreamFilter = z.infer<typeof StreamFilter>;

export type StreamEvent =
  | { type: 'lines'; sourceId: string; lines: Line[] }
  | { type: 'source'; source: Source }
  | { type: 'backfill-done' };

export const FileRead = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(0).default(0),
  maxBytes: z.number().int().min(4096).max(8 * 1024 * 1024).default(1024 * 1024),
});
export type FileRead = z.infer<typeof FileRead>;

export interface FilePage {
  /** the number of the first line returned; 1 for a file read from its start */
  firstLineNumber: number;
  lines: string[];
  /** the offset after the last complete line returned */
  nextOffset: number;
  size: number;
  eof: boolean;
}
