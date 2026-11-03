import fs from 'node:fs';

import type { CommandRun, Task, TaskStatus } from '../lib/types';
import { readLines } from '../lib/line-reader';

export interface SessionMeta {
  project: string;
  session: string;
  title: string | null;
  /** the first text the user typed, cut to 200 characters */
  firstPrompt: string | null;
  branch: string | null;
  cwd: string | null;
  startedAt: number | null;
  version: string | null;
}

interface PendingToolUse {
  tool: string;
  description: string;
  command: string;
  /** the call's input as JSON, cut at 2,000 characters; an MCP call's `command` line */
  input: string;
  startedAt: number | null;
}

export interface ParserState {
  offset: number;
  pending: Record<string, PendingToolUse>;
}

export interface ParseResult {
  state: ParserState;
  meta: SessionMeta;
  /** tasks created or changed by the lines read, by id */
  tasks: Map<string, Task>;
  /** the foreground commands whose results the lines read carried, in order */
  commands: CommandRun[];
  /** more bytes remain after this pass */
  more: boolean;
}

/** bumped when the records read or their reading change: every transcript is then parsed again from zero */
export const PARSER_VERSION = 8;

const WANTED = [
  '"type":"ai-title"', '"type":"custom-title"', '"type":"summary"', '"tool_use"', 'Command running in background with ID',
  '<task-notification>', '"type":"user"',
];
const PASS_BYTES = 8 * 1024 * 1024;

function wanted(line: string): boolean {
  for (const w of WANTED) if (line.includes(w)) return true;
  return false;
}

/**
 * The log file a command names: --log <path>, else a redirection to a text file. A shell variable the
 * same command assigns (`S=/path; … --log $S/run.log`) is expanded; a path with an unresolved one is
 * dropped rather than kept as text no file has.
 */
export function logPathOf(command: string): string | null {
  const m = command.match(/--log[= ]+("([^"]+)"|'([^']+)'|(\S+))/);
  let p = m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
  if (!p) {
    const r = command.match(/>\s*("([^"]+\.(?:log|out|txt))"|'([^']+\.(?:log|out|txt))'|(\S+\.(?:log|out|txt)))/);
    p = r ? (r[2] ?? r[3] ?? r[4] ?? null) : null;
  }
  if (!p) return null;
  const vars = new Map<string, string>();
  for (const a of command.matchAll(/(?:^|[;&|\s])([A-Za-z_]\w*)=("([^"]*)"|'([^']*)'|([^\s;&|]*))/g)) {
    vars.set(a[1], a[3] ?? a[4] ?? a[5] ?? '');
  }
  const expanded = p.replace(/\$\{(\w+)\}|\$(\w+)/g, (whole, braced: string | undefined, bare: string | undefined) => vars.get(braced ?? bare ?? '') ?? whole);
  return expanded.includes('$') ? null : expanded;
}

function ms(ts: unknown): number | null {
  if (typeof ts !== 'string') return null;
  const v = Date.parse(ts);
  return Number.isNaN(v) ? null : v;
}

function statusOf(s: string): TaskStatus {
  if (s === 'completed' || s === 'failed' || s === 'killed' || s === 'running') return s;
  if (s === 'stopped') return 'killed'; // the harness's word for a task its session's end took with it
  return 'unknown';
}

/** one pass over the transcript from state.offset; call again while `more` */
export function parseTranscript(
  file: string,
  project: string,
  session: string,
  state: ParserState,
  meta: SessionMeta,
  known: (id: string) => Task | undefined,
): ParseResult {
  const r = readLines(file, state.offset, PASS_BYTES);
  const tasks = new Map<string, Task>();
  const pending = { ...state.pending };
  const commands: CommandRun[] = [];
  /** the harness saved the output aside: the file's content when it is there and not over a megabyte */
  const persisted = (text: string): { output: string; file: string | null } => {
    const m = text.match(/<persisted-output>[\s\S]*?Full output saved to: (\S+)/);
    if (!m) return { output: text, file: null };
    try {
      if (fs.statSync(m[1]).size <= 1024 * 1024) return { output: fs.readFileSync(m[1], 'utf8'), file: m[1] };
    } catch {
      // the file is gone: the result's preview stands
    }
    return { output: text, file: m[1] };
  };
  const task = (id: string): Task =>
    tasks.get(id) ??
    known(id) ?? {
      id, project, session, toolUseId: null, tool: 'Bash', description: '', command: '', logPath: null,
      outputFile: null, startedAt: null, endedAt: null, status: 'running', exitCode: null, summary: null,
    };

  /** a <task-notification> block anywhere in `text`: the task's end */
  const applyNotification = (text: string, at: number | null): void => {
    const n = text.match(/<task-notification>([\s\S]*?)<\/task-notification>/);
    if (!n) return;
    const tag = (name: string) => n[1].match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;
    const ids = [...n[1].matchAll(/<task-id>([\s\S]*?)<\/task-id>/g)].map(x => x[1].trim()).filter(x => x && !x.startsWith('__orphan_summary__'));
    if (ids.length === 0) return;
    // a Monitor event names the task it watches and carries no status: not an end, not a task
    const status = tag('status');
    if (!status) return;
    if (ids.length > 1 || status === 'stopped') {
      // the summary a resumed session gets: the listed tasks did not finish before the previous session ended
      for (const id of ids) {
        const t = tasks.get(id) ?? known(id);
        if (t && t.status === 'running') tasks.set(id, { ...t, status: 'killed', endedAt: at, summary: tag('summary') });
      }
      return;
    }
    const id = ids[0];
    const summary = tag('summary');
    const exit = summary?.match(/exit code (\d+)/);
    const toolUseId = tag('tool-use-id');
    const p = toolUseId ? pending[toolUseId] : undefined;
    const t = task(id);
    tasks.set(id, {
      ...t,
      toolUseId: toolUseId ?? t.toolUseId,
      tool: p?.tool ?? t.tool,
      description: p?.description ?? t.description,
      command: p?.command ?? t.command,
      logPath: t.logPath ?? (p ? logPathOf(p.command) : null),
      outputFile: tag('output-file') ?? t.outputFile,
      startedAt: t.startedAt ?? p?.startedAt ?? null,
      endedAt: at,
      status: statusOf(status),
      exitCode: exit ? Number(exit[1]) : t.exitCode,
      summary,
    });
    if (toolUseId) delete pending[toolUseId];
  };

  for (const line of r.lines) {
    if (!wanted(line)) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = o.type;
    if (type === 'custom-title' && typeof o.customTitle === 'string') {
      meta = { ...meta, title: o.customTitle };
      continue;
    }
    if (type === 'ai-title' && typeof o.aiTitle === 'string' && !meta.title) {
      meta = { ...meta, title: o.aiTitle };
      continue;
    }
    if (type === 'summary' && typeof o.summary === 'string' && !meta.title) {
      meta = { ...meta, title: o.summary };
      continue;
    }
    // the notification is queued for the session's next turn: a queue-operation record carries the block as its content
    if (type === 'queue-operation' && typeof o.content === 'string') {
      applyNotification(o.content, ms(o.timestamp));
      continue;
    }
    const message = o.message as { content?: unknown } | undefined;
    const content = message?.content;
    if (type === 'user') {
      if (typeof o.gitBranch === 'string' && o.gitBranch) meta = { ...meta, branch: o.gitBranch };
      if (typeof o.cwd === 'string' && o.cwd) meta = { ...meta, cwd: o.cwd };
      if (typeof o.version === 'string') meta = { ...meta, version: o.version };
      const at = ms(o.timestamp);
      if (at !== null && (meta.startedAt === null || at < meta.startedAt)) meta = { ...meta, startedAt: at };
      const items = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
      for (const item of items as Record<string, unknown>[]) {
        if (item.type === 'text' && typeof item.text === 'string') {
          const text = item.text.trim();
          if (meta.firstPrompt === null && !o.isMeta && !o.isSidechain && text && !text.startsWith('<')) {
            meta = { ...meta, firstPrompt: text.slice(0, 200) };
          }
          applyNotification(text, at);
        } else if (item.type === 'tool_result' && typeof item.tool_use_id === 'string') {
          const text = typeof item.content === 'string' ? item.content : Array.isArray(item.content) ? (item.content as { text?: string }[]).map(c => c.text ?? '').join('\n') : '';
          // anchored: a command that prints such a line (a grep over a transcript) must not become a task
          // the path runs to the sentence's final dot: a lazy match stopped at the first dot of the path
          const m = text.match(/^Command running in background with ID: (\S+?)\. Output is being written to: (\S+?)\.(?=\s|$)/);
          if (!m) {
            const p = pending[item.tool_use_id];
            if (p && (p.tool === 'Bash' || p.tool.startsWith('mcp__'))) {
              const { output, file } = persisted(text);
              const mcp = p.tool.startsWith('mcp__');
              commands.push({
                toolUseId: item.tool_use_id, project, session, tool: p.tool,
                description: mcp ? p.tool.slice(5).replace('__', ' ') : p.description,
                command: mcp ? p.input : p.command,
                startedAt: p.startedAt, endedAt: at, isError: item.is_error === true, output, persistedFile: file,
              });
              delete pending[item.tool_use_id];
            }
            continue;
          }
          const p = pending[item.tool_use_id];
          const t = task(m[1]);
          tasks.set(m[1], {
            ...t,
            toolUseId: item.tool_use_id,
            tool: p?.tool ?? 'Bash',
            description: p?.description ?? t.description,
            command: p?.command ?? t.command,
            logPath: p ? logPathOf(p.command) : t.logPath,
            outputFile: m[2],
            startedAt: p?.startedAt ?? at,
            status: t.endedAt ? t.status : 'running',
          });
        }
      }
      continue;
    }
    if (type === 'assistant' && Array.isArray(content)) {
      for (const item of content as Record<string, unknown>[]) {
        if (item.type !== 'tool_use' || typeof item.id !== 'string') continue;
        const input = (item.input ?? {}) as Record<string, unknown>;
        const description = typeof input.description === 'string' ? input.description : typeof input.prompt === 'string' ? input.prompt.slice(0, 120) : '';
        pending[item.id] = {
          tool: typeof item.name === 'string' ? item.name : 'tool',
          description,
          command: typeof input.command === 'string' ? input.command : '',
          input: JSON.stringify(input).slice(0, 2000),
          startedAt: ms(o.timestamp),
        };
      }
    }
  }
  // pending entries older than the last 200 are results that never came (foreground calls): dropped
  const ids = Object.keys(pending);
  for (const id of ids.slice(0, Math.max(0, ids.length - 200))) delete pending[id];
  return { state: { offset: r.nextOffset, pending }, meta, tasks, commands, more: r.nextOffset < r.size };
}
