import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import type { CommandRun, Line, ProjectSummary, SessionSummary, Source, SourceKind, StreamEvent, StreamFilter, Task, TaskStatus } from '../lib/types';
import { layout } from './layout';
import { loadParserState, loadSessionMeta, loadTag, loadTasks, saveParserState, saveSessionMeta, saveTag, saveTask } from './meta-store';
import { Tailer, VirtualTail } from './tailer';
import { loadCommands, saveCommand } from './command-store';
import { clock } from '../lib/format';
import { isTextCandidate } from './text-files';
import { type ParserState, type SessionMeta, parseTranscript } from './transcripts';
import { type FileSeen, RootWatcher, type WatchEvent, walkScratchpadRoot, walkTranscriptRoot } from './watcher';

/** a session is active while a task runs or its transcript moved within this window */
export const ACTIVE_MS = 10 * 60 * 1000;

/** the path as the watcher reports it: /tmp is a link to /private/tmp on macOS, and commands write either */
function realPath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/** how a task's output file ended: the harness writes "[exited with code N]" or "[killed]" as its last line */
interface Ended {
  status: TaskStatus;
  exitCode: number | null;
  /** the output file's modification time: when the trailer was written */
  at: number;
}

interface SessionRecord {
  project: string;
  session: string;
  meta: SessionMeta;
  parser: ParserState;
  transcriptFile: string | null;
  transcriptMtime: number;
  tasks: Map<string, Task>;
  sources: Map<string, Source>;
  /** the trailers read from tasks/<id>.output, by task id, for tasks the transcript never ends */
  ended: Map<string, Ended>;
  /** the session's foreground commands as a source */
  commands: VirtualTail;
  /** the session's MCP calls as a source */
  mcp: VirtualTail;
  tag: string | null;
}

interface Located {
  kind: SourceKind | 'transcript';
  project: string;
  session: string;
  name: string;
}

/** the kinds that are not files: a session's commands and its MCP calls */
export type VirtualKind = 'command' | 'mcp';

/** the id of a session's virtual source: not a path, so no root ever matches it */
export function virtualSourceId(kind: VirtualKind, project: string, session: string): string {
  return `${kind}:${project}/${session}`;
}

/** the virtual source a run belongs to */
export function kindOf(c: CommandRun): VirtualKind {
  return c.tool.startsWith('mcp__') ? 'mcp' : 'command';
}

/** the lines one run adds: a header, the command's first line (an MCP call's input), the output */
export function commandLines(c: CommandRun): string[] {
  const took = c.startedAt !== null && c.endedAt !== null ? ` (${((c.endedAt - c.startedAt) / 1000).toFixed(1)} s)` : '';
  const head = `>> ${clock(c.endedAt ?? c.startedAt ?? Date.now())} · ${c.description || '(no description)'} · ${c.isError ? 'ERROR' : 'ok'}${took}`;
  const cmd = `$ ${c.command.split('\n').join(' ⏎ ').slice(0, 300)}`;
  const out = c.output.replace(/\r\n?/g, '\n').split('\n');
  if (out.length > 0 && out.at(-1) === '') out.pop();
  return [head, cmd, ...out, ''];
}

export class Registry extends EventEmitter {
  readonly sessions = new Map<string, SessionRecord>();
  readonly sources = new Map<string, Source>();
  private readonly tailers = new Map<string, Tailer>();
  private readonly watchers: RootWatcher[] = [];
  private readonly startedAt = Date.now();
  private readonly roots = layout().roots;
  private readonly transcriptsRoot = layout().transcriptsRoot;

  start(log: (line: string) => void): void {
    for (const root of this.roots) this.attach(new RootWatcher(root, walkScratchpadRoot), log);
    this.attach(new RootWatcher(this.transcriptsRoot, walkTranscriptRoot), log);
    log(`[registry] ${this.sources.size} source(s) in ${this.sessions.size} session(s) · roots ${this.roots.join(', ')} · transcripts ${this.transcriptsRoot}`);
  }

  stop(): void {
    for (const w of this.watchers) w.stop();
  }

  private attach(w: RootWatcher, log: (line: string) => void): void {
    this.watchers.push(w);
    w.on('event', (e: WatchEvent) => (e.type === 'file' ? this.seen(e.file, true) : this.removed(e.path)));
    w.on('rescan', (files: FileSeen[]) => this.reconcile(w.root, files));
    w.on('error', (e: Error) => log(`[watch] ${w.root}: ${e.message}`));
    for (const f of w.start()) this.seen(f, false);
  }

  /** where a path belongs, or null when it is nothing the tool reads */
  locate(p: string): Located | null {
    for (const root of this.roots) {
      if (!p.startsWith(root + path.sep)) continue;
      const rel = p.slice(root.length + 1).split(path.sep);
      if (rel.length < 4) return null;
      const [project, session, area] = rel;
      if (area === 'scratchpad') return { kind: 'scratchpad', project, session, name: rel.slice(2).join('/') };
      if (area === 'tasks' && rel.length === 4) return { kind: 'task', project, session, name: rel.slice(2).join('/') };
      return null;
    }
    if (p.startsWith(this.transcriptsRoot + path.sep)) {
      const rel = p.slice(this.transcriptsRoot.length + 1).split(path.sep);
      if (rel.length === 2 && rel[1].endsWith('.jsonl')) return { kind: 'transcript', project: rel[0], session: rel[1].slice(0, -6), name: rel[1] };
      if (rel.length === 4 && rel[2] === 'tool-results') return { kind: 'tool-result', project: rel[0], session: rel[1], name: `tool-results/${rel[3]}` };
    }
    return null;
  }

  private record(project: string, session: string): SessionRecord {
    const key = `${project}/${session}`;
    let r = this.sessions.get(key);
    if (!r) {
      r = {
        project, session, meta: loadSessionMeta(project, session), parser: loadParserState(project, session),
        transcriptFile: null, transcriptMtime: 0, tasks: new Map(loadTasks(project, session).map(t => [t.id, t])), sources: new Map(),
        ended: new Map(), commands: new VirtualTail(), mcp: new VirtualTail(), tag: loadTag(project, session),
      };
      this.sessions.set(key, r);
      for (const kind of ['command', 'mcp'] as const) {
        const source: Source = {
          id: virtualSourceId(kind, project, session), kind, project, session, name: kind === 'command' ? 'commands' : 'mcp',
          size: 0, mtime: 0, gone: false, taskId: null,
        };
        this.sources.set(source.id, source);
        r.sources.set(source.id, source);
      }
      for (const c of loadCommands(project, session)) this.appendCommand(r, c, false);
    }
    return r;
  }

  private seen(f: FileSeen, live: boolean): void {
    const at = this.locate(f.path);
    if (!at) return;
    const r = this.record(at.project, at.session);
    if (at.kind === 'transcript') {
      r.transcriptFile = f.path;
      r.transcriptMtime = f.mtime;
      this.parse(r, f.size);
      return;
    }
    let s = this.sources.get(f.path);
    if (!s) {
      if (!isTextCandidate(f.path, f.size)) return;
      s = { id: f.path, kind: at.kind, project: at.project, session: at.session, name: at.name, size: f.size, mtime: f.mtime, gone: false, taskId: null };
      this.sources.set(s.id, s);
      r.sources.set(s.id, s);
      this.join(r, s);
      const tailer = new Tailer(f.path);
      tailer.on('lines', (lines: Line[]) => {
        this.emit('lines', s!.id, lines);
        if (s!.kind === 'task') this.trailer(r, s!, lines);
      });
      tailer.on('gone', () => this.mark(s!, { gone: true }));
      tailer.on('back', () => this.mark(s!, { gone: false }));
      this.tailers.set(s.id, tailer);
      this.emit('source', s);
      tailer.join(f.size, live && f.mtime >= this.startedAt);
      this.emit('session', this.summary(r));
      return;
    }
    if (s.gone) this.mark(s, { gone: false });
    if (f.size !== s.size || f.mtime !== s.mtime) {
      s.size = f.size;
      s.mtime = f.mtime;
      this.tailers.get(s.id)?.poll();
    }
  }

  private removed(p: string): void {
    const s = this.sources.get(p);
    if (s) {
      this.mark(s, { gone: true });
      return;
    }
    // a removed directory: every source under it
    for (const src of this.sources.values()) {
      if (src.id.startsWith(p + path.sep)) this.mark(src, { gone: true });
    }
  }

  private mark(s: Source, patch: Partial<Source>): void {
    Object.assign(s, patch);
    this.emit('source', s);
    const r = this.sessions.get(`${s.project}/${s.session}`);
    if (r) this.emit('session', this.summary(r));
  }

  /** after a full walk: files the events missed, and files that disappeared */
  private reconcile(root: string, files: FileSeen[]): void {
    const present = new Set<string>();
    for (const f of files) {
      present.add(f.path);
      this.seen(f, true);
    }
    for (const s of this.sources.values()) {
      if (!s.gone && s.id.startsWith(root + path.sep) && !present.has(s.id)) this.mark(s, { gone: true });
    }
  }

  private parse(r: SessionRecord, size: number): void {
    if (!r.transcriptFile) return;
    if (size < r.parser.offset) r.parser = { offset: 0, pending: {} }; // rewritten
    if (size === r.parser.offset) return;
    let more = true;
    while (more) {
      const out = parseTranscript(r.transcriptFile, r.project, r.session, r.parser, r.meta, id => r.tasks.get(id));
      r.parser = out.state;
      r.meta = out.meta;
      for (const t of out.tasks.values()) {
        r.tasks.set(t.id, t);
        saveTask(t);
        const e = r.ended.get(t.id);
        if (e && t.status === 'running') this.endTask(r, t, e);
      }
      for (const c of out.commands) this.appendCommand(r, c, true);
      more = out.more;
    }
    saveSessionMeta(r.meta);
    saveParserState(r.project, r.session, r.parser);
    for (const s of r.sources.values()) this.join(r, s);
    this.emit('session', this.summary(r));
  }

  /**
   * The last line of tasks/<id>.output is the harness's trailer, "[exited with code N]" or "[killed]". It ends the
   * task when the transcript carries no notification: a task stopped through the harness, a session closed before
   * the command returned. A notification read later keeps its own status (the parser applies the trailer only to a
   * task still running).
   */
  private trailer(r: SessionRecord, s: Source, lines: Line[]): void {
    if (!s.taskId) return;
    for (const l of lines) {
      const m = /^\[exited with code (\d+)\]$/.exec(l.s);
      const ended: Ended | null = m
        ? { status: Number(m[1]) === 0 ? 'completed' : 'failed', exitCode: Number(m[1]), at: s.mtime }
        : l.s === '[killed]'
          ? { status: 'killed', exitCode: null, at: s.mtime }
          : null;
      if (!ended) continue;
      r.ended.set(s.taskId, ended);
      const t = r.tasks.get(s.taskId);
      if (t && t.status === 'running') this.endTask(r, t, ended);
    }
  }

  private endTask(r: SessionRecord, t: Task, ended: Ended): void {
    const done: Task = { ...t, status: ended.status, exitCode: ended.exitCode, endedAt: t.endedAt ?? ended.at };
    r.tasks.set(t.id, done);
    saveTask(done);
    this.emit('session', this.summary(r));
  }

  /** the virtual tail of a session for a kind */
  private tailOf(r: SessionRecord, kind: VirtualKind): VirtualTail {
    return kind === 'command' ? r.commands : r.mcp;
  }

  /** one run's lines into the session's source of its kind; `live` emits them (a load from the store does not) */
  private appendCommand(r: SessionRecord, c: CommandRun, live: boolean): void {
    const kind = kindOf(c);
    const source = r.sources.get(virtualSourceId(kind, r.project, r.session));
    if (!source) return;
    const tail = this.tailOf(r, kind);
    const fresh = tail.push(commandLines(c), c.endedAt ?? Date.now());
    source.size = tail.buffer.lines.length;
    source.mtime = Math.max(source.mtime, c.endedAt ?? 0);
    if (live) {
      saveCommand(c);
      this.emit('lines', source.id, fresh);
      this.emit('source', source);
    }
  }

  /** the task a source belongs to: tasks/<id>.output by id; a scratchpad file by the path a command names */
  private join(r: SessionRecord, s: Source): void {
    if (s.kind === 'task') {
      s.taskId = path.basename(s.name, '.output');
      return;
    }
    if (s.kind !== 'scratchpad') return;
    for (const t of r.tasks.values()) {
      if (t.logPath && realPath(t.logPath) === s.id) {
        s.taskId = t.id;
        return;
      }
    }
  }

  projectLabel(project: string): string {
    for (const r of this.sessions.values()) {
      if (r.project === project && r.meta.cwd) return path.basename(r.meta.cwd);
    }
    return project.length > 40 ? `…${project.slice(-40)}` : project;
  }

  /**
   * A running task whose output file is gone cannot be observed any more: the harness removes a finished
   * session's tasks folder, and a trailer will never come. Shown as unknown; the stored status stays.
   */
  private observed(t: Task): Task {
    if (t.status !== 'running' || !t.outputFile) return t;
    const src = this.sources.get(t.outputFile);
    const present = src ? !src.gone : fs.existsSync(t.outputFile);
    return present ? t : { ...t, status: 'unknown' };
  }

  summary(r: SessionRecord): SessionSummary {
    const tasks = [...r.tasks.values()].map(t => this.observed(t)).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    const sources = [...r.sources.values()].sort((a, b) => b.mtime - a.mtime);
    const lastActivity = Math.max(r.transcriptMtime, sources[0]?.mtime ?? 0, r.meta.startedAt ?? 0);
    const running = tasks.some(t => t.status === 'running');
    return {
      key: `${r.project}/${r.session}`, project: r.project, projectLabel: this.projectLabel(r.project), session: r.session,
      title: r.meta.title, firstPrompt: r.meta.firstPrompt, branch: r.meta.branch, cwd: r.meta.cwd, lastActivity,
      active: running || Date.now() - lastActivity < ACTIVE_MS, transcript: r.transcriptFile !== null, tag: r.tag, tasks, sources,
    };
  }

  /** the user's tag for a session: saved, and the session re-announced so every chip follows */
  setTag(project: string, session: string, tag: string | null): SessionSummary | null {
    const r = this.sessions.get(`${project}/${session}`);
    if (!r) return null;
    r.tag = tag && tag.trim() ? tag.trim() : null;
    saveTag(project, session, r.tag);
    const s = this.summary(r);
    this.emit('session', s);
    return s;
  }

  list(): ProjectSummary[] {
    const byProject = new Map<string, SessionSummary[]>();
    for (const r of this.sessions.values()) {
      const list = byProject.get(r.project) ?? [];
      list.push(this.summary(r));
      byProject.set(r.project, list);
    }
    return [...byProject.entries()]
      .map(([project, sessions]) => ({ project, label: this.projectLabel(project), sessions: sessions.sort((a, b) => b.lastActivity - a.lastActivity) }))
      .sort((a, b) => (b.sessions[0]?.lastActivity ?? 0) - (a.sessions[0]?.lastActivity ?? 0));
  }

  buffered(sourceId: string): Line[] {
    const t = this.tailers.get(sourceId);
    if (t) return t.buffer.lines;
    const s = this.sources.get(sourceId);
    const r = s && this.sessions.get(`${s.project}/${s.session}`);
    return r && (s.kind === 'command' || s.kind === 'mcp') ? this.tailOf(r, s.kind).buffer.lines : [];
  }

  /** a virtual source's page, for files.read; null for a file */
  pageVirtual(sourceId: string, from: number, maxLines: number) {
    const s = this.sources.get(sourceId);
    const r = s && this.sessions.get(`${s.project}/${s.session}`);
    return r && (s.kind === 'command' || s.kind === 'mcp') ? this.tailOf(r, s.kind).page(from, maxLines) : null;
  }

  /** the aggregate stream: backfill from the buffers, then live events, until the signal aborts */
  async *stream(filter: StreamFilter, signal: AbortSignal | undefined): AsyncGenerator<StreamEvent> {
    const include = filter.include ? new RegExp(filter.include, filter.caseSensitive ? '' : 'i') : null;
    const exclude = filter.exclude ? new RegExp(filter.exclude, filter.caseSensitive ? '' : 'i') : null;
    const sessions = new Set(filter.sessions);
    const kinds = new Set(filter.kinds);
    const files = new Set(filter.files);
    const wanted = (s: Source | undefined): s is Source =>
      !!s &&
      (files.size === 0
        ? kinds.has(s.kind) && (sessions.size === 0 || sessions.has(`${s.project}/${s.session}`))
        : files.has(s.id));
    const keep = (l: Line) => (!include || include.test(l.s)) && (!exclude || !exclude.test(l.s));

    const queue: StreamEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (e: StreamEvent) => {
      queue.push(e);
      wake?.();
    };
    const onLines = (sourceId: string, lines: Line[]) => {
      if (!wanted(this.sources.get(sourceId))) return;
      const kept = lines.filter(keep);
      if (kept.length) push({ type: 'lines', sourceId, lines: kept });
    };
    const onSource = (s: Source) => {
      if (wanted(s)) push({ type: 'source', source: { ...s } });
    };
    this.on('lines', onLines);
    this.on('source', onSource);
    try {
      // backfill: the newest `backfill` buffered lines over the included sources, oldest first
      const all: { sourceId: string; line: Line }[] = [];
      for (const s of this.sources.values()) {
        if (!wanted(s)) continue;
        yield { type: 'source', source: { ...s } };
        for (const line of this.buffered(s.id)) if (keep(line)) all.push({ sourceId: s.id, line });
      }
      all.sort((a, b) => a.line.t - b.line.t || a.sourceId.localeCompare(b.sourceId) || a.line.n - b.line.n);
      let run: { sourceId: string; lines: Line[] } | null = null;
      for (const item of all.slice(-filter.backfill)) {
        if (run && run.sourceId === item.sourceId) run.lines.push(item.line);
        else {
          if (run) yield { type: 'lines', ...run };
          run = { sourceId: item.sourceId, lines: [item.line] };
        }
      }
      if (run) yield { type: 'lines', ...run };
      yield { type: 'backfill-done' };
      while (!signal?.aborted) {
        if (queue.length === 0) await new Promise<void>(resolve => {
          wake = resolve;
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        wake = null;
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      this.off('lines', onLines);
      this.off('source', onSource);
    }
  }

  /** one file's new lines after `afterOffset`: what the buffer holds past it, then live */
  async *streamFile(sourceId: string, afterOffset: number, signal: AbortSignal | undefined): AsyncGenerator<Line[]> {
    const tailer = this.tailers.get(sourceId);
    if (!tailer && !this.sources.has(sourceId)) return;
    const queue: Line[][] = [];
    let wake: (() => void) | null = null;
    const onLines = (id: string, lines: Line[]) => {
      if (id !== sourceId) return;
      queue.push(lines);
      wake?.();
    };
    this.on('lines', onLines);
    try {
      // the reader paged the file to afterOffset; the tailer's offset is at or past it — lines between are in the buffer
      const held = this.buffered(sourceId);
      if ((!tailer || tailer.offset > afterOffset) && held.length) {
        yield [...held]; // the buffer holds the gap; the client drops the lines whose n it already has
      }
      while (!signal?.aborted) {
        if (queue.length === 0) await new Promise<void>(resolve => {
          wake = resolve;
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        wake = null;
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      this.off('lines', onLines);
    }
  }

  async *sessionChanges(signal: AbortSignal | undefined): AsyncGenerator<SessionSummary> {
    const queue = new Map<string, SessionSummary>();
    let wake: (() => void) | null = null;
    const onSession = (s: SessionSummary) => {
      queue.set(s.key, s);
      wake?.();
    };
    this.on('session', onSession);
    try {
      while (!signal?.aborted) {
        if (queue.size === 0) await new Promise<void>(resolve => {
          wake = resolve;
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        wake = null;
        await new Promise(r => setTimeout(r, 300)); // coalesce a burst
        for (const s of queue.values()) yield s;
        queue.clear();
      }
    } finally {
      this.off('session', onSession);
    }
  }
}

/** one registry for the process, started by trpc-ws.ts */
export const registry = new Registry();
