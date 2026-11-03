import fs from 'node:fs';

export interface LinesRead {
  lines: string[];
  /** the offset just after the last '\n' consumed; equal to `from` when no complete line was read */
  nextOffset: number;
  /** the file's size at the time of the read */
  size: number;
}

/**
 * Up to maxBytes from `from`, split on '\n'; the bytes after the last newline are not consumed. A
 * '\r' before the newline is dropped. The file is opened and closed inside the call.
 */
export function readLines(file: string, from: number, maxBytes: number): LinesRead {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (from >= size) return { lines: [], nextOffset: from, size };
    const want = Math.min(maxBytes, size - from);
    const buf = Buffer.allocUnsafe(want);
    const got = fs.readSync(fd, buf, 0, want, from);
    const end = buf.lastIndexOf(0x0a, got - 1);
    if (end < 0) {
      // no newline in the window: a line longer than maxBytes is cut here rather than never shown
      return got >= maxBytes
        ? { lines: [buf.toString('utf8', 0, got)], nextOffset: from + got, size }
        : { lines: [], nextOffset: from, size };
    }
    const text = buf.toString('utf8', 0, end);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].endsWith('\r')) lines[i] = lines[i].slice(0, -1);
    }
    return { lines, nextOffset: from + end + 1, size };
  } finally {
    fs.closeSync(fd);
  }
}

/** the number of '\n' in [0, until) — the line count before an offset; the file is streamed in 1 MB blocks */
export function countNewlines(file: string, until: number): number {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let pos = 0;
    let count = 0;
    while (pos < until) {
      const got = fs.readSync(fd, buf, 0, Math.min(buf.length, until - pos), pos);
      if (got <= 0) break;
      for (let i = 0; i < got; i++) if (buf[i] === 0x0a) count++;
      pos += got;
    }
    return count;
  } finally {
    fs.closeSync(fd);
  }
}
