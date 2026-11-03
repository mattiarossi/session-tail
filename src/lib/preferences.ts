import { z } from 'zod';

import { SourceKind } from './types';

/** the defaults a user keeps between sessions, in the store; a key never stored reads as its default */
export const Preferences = z.object({
  /** the kinds the stream shows when the page names none */
  kinds: z.array(SourceKind).default(['scratchpad', 'task', 'command', 'mcp']),
  /** the buffered lines the stream shows before the live ones */
  backfill_lines: z.number().int().min(0).max(5000).default(500),
  /** the lines the stream page keeps */
  max_rows: z.number().int().min(1000).max(200_000).default(20_000),
  /** sessions idle for longer are folded in the sidebar */
  idle_hours: z.number().int().min(1).max(720).default(24),
  wrap: z.boolean().default(false),
  /** the log lines' font, px */
  font_size: z.number().int().min(8).max(18).default(10),
  /** the interface's base font, px: every other text size is relative to it */
  ui_font_size: z.number().int().min(10).max(18).default(14),
  /** the time column: when the collector read the line */
  show_time: z.boolean().default(false),
  /** the file name beside the session chip in the stream */
  show_file: z.boolean().default(true),
  /** a marker row with the time, the session and the file before each burst of output in the stream */
  stream_markers: z.boolean().default(true),
  /** bursts longer than three lines fold to their first three, the newest excepted; a click expands one */
  collapse_bursts: z.boolean().default(true),
  /** the files (source ids) the follow panel tails; managed from the pages, not the preferences page */
  followed: z.array(z.string()).default([]),
  /** the sessions pane shown; the ◀ and ▶ handles, the top bar's button and `b` set it */
  sidebar_open: z.boolean().default(true),
  /** the follow panel's height, px; its top edge drags */
  panel_height: z.number().int().min(100).max(4000).default(300),
});
export type Preferences = z.infer<typeof Preferences>;

export const DEFAULT_PREFERENCES: Preferences = Preferences.parse({});
export const PREFERENCE_KEYS = Object.keys(Preferences.shape) as (keyof Preferences)[];
