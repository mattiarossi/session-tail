/**
 * probe.ts — `yarn probe [--sessions=<key,…>] [--kinds=scratchpad,task,tool-result] [--grep=<regex>] [--list]`
 * (a session key starts with '-', so the values are given with '=')
 * Starts the collector with no server, prints every project and session with its tasks, then prints
 * the aggregate stream as `[<session short id> <file>] <line>` until stopped. `--list` prints and exits.
 */
import { parseArgs } from 'node:util';

import { registry } from '../src/server/registry';
import { StreamFilter } from '../src/lib/types';

const { values } = parseArgs({
  options: {
    sessions: { type: 'string' },
    kinds: { type: 'string' },
    grep: { type: 'string' },
    list: { type: 'boolean', default: false },
  },
});

const t0 = Date.now();
registry.start(line => process.stdout.write(`${line}\n`));
process.stdout.write(`[probe] started in ${Date.now() - t0} ms\n`);

for (const p of registry.list()) {
  process.stdout.write(`\n${p.label}  (${p.project})\n`);
  for (const s of p.sessions) {
    const running = s.tasks.filter(t => t.status === 'running').length;
    process.stdout.write(
      `  ${s.active ? '●' : '○'} ${s.session.slice(0, 8)}  ${new Date(s.lastActivity).toISOString()}  ${s.branch ?? '-'}  ${s.title ?? s.firstPrompt ?? '-'}\n` +
        `      ${s.sources.length} source(s), ${s.tasks.length} task(s), ${running} running\n`,
    );
    for (const t of s.tasks.slice(0, 5)) {
      process.stdout.write(`      ${t.status.padEnd(9)} ${t.exitCode ?? '-'}  ${t.id}  ${t.description || t.command.slice(0, 80)}\n`);
    }
  }
}
if (values.list) process.exit(0);

const filter = StreamFilter.parse({
  sessions: values.sessions ? values.sessions.split(',') : [],
  kinds: values.kinds ? values.kinds.split(',') : undefined,
  include: values.grep ?? null,
  backfill: 50,
});
const short = new Map<string, string>();
for (const p of registry.list()) for (const s of p.sessions) short.set(s.key, s.session.slice(0, 8));

process.stdout.write('\n[probe] streaming; Ctrl-C stops\n');
const tagOf = (id: string): string => {
  const s = registry.sources.get(id);
  return s ? `${short.get(`${s.project}/${s.session}`) ?? '????????'} ${s.name}` : id;
};
for await (const e of registry.stream(filter, undefined)) {
  if (e.type === 'source') process.stdout.write(`[${tagOf(e.source.id)}] (file ${e.source.gone ? 'gone' : 'seen'} · ${e.source.size} bytes)\n`);
  if (e.type !== 'lines') continue;
  const tag = tagOf(e.sourceId);
  for (const l of e.lines) process.stdout.write(`[${tag}] ${l.s}\n`);
}
