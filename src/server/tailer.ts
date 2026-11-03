import { EventEmitter } from 'node:events';
import fs from 'node:fs';

import type { Line } from '../lib/types';
import { countNewlines, readLines } from '../lib/line-reader';

/** what an existing file contributes when first seen: its last 64 KB */
export const JOIN_TAIL_BYTES = 64 * 1024;
/** line numbers are counted from the start for files up to this size; larger files join with n = 0 */
export const COUNT_LINES_UP_TO = 16 * 1024 * 1024;
/** the lines kept per source, by text size */
export const BUFFER_BYTES = 2 * 1024 * 1024;
/** read per delta; a larger delta is read in several passes */
const DELTA_BYTES = 4 * 1024 * 1024;

/**
 * Tails one file: remembers the offset after the last complete line, reads the new bytes on each
 * `poll()` (open, read, close), keeps the last BUFFER_BYTES of lines, and emits 'lines' with the new
 * ones. A size below the offset is a truncation: the buffer is kept, the offset restarts at zero and
 * numbering restarts at one. A missing file marks the tailer gone and keeps the buffer.
 */
/** the last BUFFER_BYTES of a source's lines, by text length */
export class LineBuffer {
  readonly lines: Line[] = [];
  private bytes = 0;

  push(fresh: Line[]): void {
    for (const l of fresh) {
      this.lines.push(l);
      this.bytes += l.s.length + 16;
    }
    while (this.bytes > BUFFER_BYTES && this.lines.length > 1) {
      const dropped = this.lines.shift()!;
      this.bytes -= dropped.s.length + 16;
    }
  }
}

export class Tailer extends EventEmitter {
  offset = 0;
  /** the number of the next line to read */
  private nextN = 1;
  readonly buffer = new LineBuffer();
  gone = false;

  constructor(readonly file: string) {
    super();
  }

  /** first read: the tail of an existing file, or everything when `fromStart` (a file created after the start) */
  join(size: number, fromStart: boolean): void {
    if (fromStart || size <= JOIN_TAIL_BYTES) {
      this.offset = 0;
      this.nextN = 1;
    } else {
      this.offset = size - JOIN_TAIL_BYTES;
      // skip the partial line the window starts in
      const probe = readLines(this.file, this.offset, JOIN_TAIL_BYTES);
      if (probe.lines.length > 0) {
        const firstNewline = Buffer.byteLength(probe.lines[0], 'utf8') + 1;
        this.offset += firstNewline;
      }
      this.nextN = size <= COUNT_LINES_UP_TO ? countNewlines(this.file, this.offset) + 1 : 0;
    }
    this.poll();
  }

  poll(): void {
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      if (!this.gone) {
        this.gone = true;
        this.emit('gone');
      }
      return;
    }
    if (this.gone) {
      this.gone = false;
      this.emit('back');
    }
    if (size < this.offset) {
      this.offset = 0;
      this.nextN = 1;
      this.emit('truncated');
    }
    const fresh: Line[] = [];
    while (this.offset < size) {
      const r = readLines(this.file, this.offset, DELTA_BYTES);
      if (r.nextOffset === this.offset) break; // a partial line only; wait for its newline
      const t = Date.now();
      for (const s of r.lines) {
        const n = this.nextN === 0 ? 0 : this.nextN++;
        fresh.push({ n, t, s });
      }
      this.offset = r.nextOffset;
      size = r.size;
    }
    if (fresh.length === 0) return;
    this.buffer.push(fresh);
    this.emit('lines', fresh);
  }
}

/** the lines of a source that is not a file (a session's commands): numbered as they are pushed, kept like a file's */
export class VirtualTail {
  readonly buffer = new LineBuffer();
  private nextN = 1;

  push(texts: string[], t = Date.now()): Line[] {
    const fresh = texts.map(s => ({ n: this.nextN++, t, s }));
    this.buffer.push(fresh);
    return fresh;
  }

  /** the held lines from a line index; the page shape files.read answers with */
  page(from: number, maxLines: number): { firstLineNumber: number; lines: string[]; nextOffset: number; size: number; eof: boolean } {
    const all = this.buffer.lines;
    const slice = all.slice(from, from + maxLines);
    return {
      firstLineNumber: slice[0]?.n ?? all.at(-1)?.n ?? 1,
      lines: slice.map(l => l.s),
      nextOffset: from + slice.length,
      size: all.length,
      eof: from + slice.length >= all.length,
    };
  }
}
