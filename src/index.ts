#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { detectFormat, extractTimestamp, findFormatById, FORMATS } from './timestamps.js';
import { findGaps, type Gap, type TimestampedEntry } from './gaps.js';

interface Options {
  file: string | null;
  thresholdSeconds: number;
  json: boolean;
  format: string | null;
}

const FORMAT_IDS = FORMATS.map((format) => format.id).join(', ');

const USAGE = `usage: logcadence [file] [--threshold seconds] [--format id] [--json]

Scan a log file for gaps between consecutive timestamps. A gap that's
much longer than the surrounding traffic often means a process hung,
a GC pause ran long, or something crashed and restarted quietly.

If no file is given, or the file is "-", input is read from stdin.

Options:
  --threshold <seconds>  minimum gap size to report (default: 5)
  --format <id>          skip auto-detection, use this format: ${FORMAT_IDS}
  --json                 print machine-readable JSON instead of a table
  -h, --help             show this message
`;

export function parseArgs(argv: string[]): Options {
  let file: string | null = null;
  let sawFileArg = false;
  let thresholdSeconds = 5;
  let json = false;
  let format: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--threshold') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--threshold requires a value in seconds');
      thresholdSeconds = Number(value);
      if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
        throw new Error('--threshold must be a positive number');
      }
      continue;
    }
    if (arg === '--format') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--format requires a value');
      if (!findFormatById(value)) {
        throw new Error(`unknown format "${value}" (valid: ${FORMAT_IDS})`);
      }
      format = value;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`unknown option: ${arg}`);
    }
    if (sawFileArg) {
      throw new Error('only one log file may be given');
    }
    sawFileArg = true;
    file = arg === '-' ? null : arg;
  }

  return { file, thresholdSeconds, json, format };
}

function readLines(path: string | null): string[] {
  const raw = path === null ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  const lines = raw.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function printHuman(options: Options, formatName: string, totalLines: number, entries: TimestampedEntry[], gaps: Gap[]): void {
  console.log(`log: ${options.file ?? '(stdin)'}`);
  console.log(options.format ? `format: ${formatName} (forced with --format)` : `format detected: ${formatName}`);
  console.log(`lines scanned: ${totalLines} (${entries.length} with timestamps)`);

  if (entries.length >= 2) {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const spanSeconds = (last.time - first.time) / 1000;
    console.log(
      `time span: ${new Date(first.time).toISOString()} -> ${new Date(last.time).toISOString()} (${spanSeconds.toFixed(1)}s)`,
    );
  }

  console.log(`gaps >= ${options.thresholdSeconds}s: ${gaps.length}`);
  for (const gap of gaps) {
    console.log(
      `  line ${gap.fromLine} -> ${gap.toLine}   ${gap.seconds.toFixed(1)}s   ` +
        `${new Date(gap.fromTime).toISOString()} -> ${new Date(gap.toTime).toISOString()}`,
    );
  }

  if (gaps.length > 0) {
    const longest = gaps.reduce((a, b) => (b.seconds > a.seconds ? b : a));
    console.log(`longest gap: ${longest.seconds.toFixed(1)}s (line ${longest.fromLine} -> ${longest.toLine})`);
  }
}

function printJson(options: Options, formatName: string, totalLines: number, entries: TimestampedEntry[], gaps: Gap[]): void {
  const first = entries[0] ?? null;
  const last = entries.length > 0 ? entries[entries.length - 1] : null;
  const longest = gaps.length > 0 ? gaps.reduce((a, b) => (b.seconds > a.seconds ? b : a)) : null;

  const result = {
    file: options.file ?? '(stdin)',
    format: formatName,
    thresholdSeconds: options.thresholdSeconds,
    totalLines,
    timestampedLines: entries.length,
    firstTimestamp: first ? new Date(first.time).toISOString() : null,
    lastTimestamp: last ? new Date(last.time).toISOString() : null,
    spanSeconds: first && last ? (last.time - first.time) / 1000 : null,
    gaps: gaps.map((gap) => ({
      fromLine: gap.fromLine,
      toLine: gap.toLine,
      fromTime: new Date(gap.fromTime).toISOString(),
      toTime: new Date(gap.toTime).toISOString(),
      seconds: gap.seconds,
    })),
    longestGap: longest
      ? {
          fromLine: longest.fromLine,
          toLine: longest.toLine,
          seconds: longest.seconds,
        }
      : null,
  };

  console.log(JSON.stringify(result, null, 2));
}

function fail(message: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(`logcadence: ${message}`);
  }
  process.exit(1);
}

function main(): void {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`logcadence: ${(err as Error).message}`);
    console.error(USAGE);
    process.exit(1);
  }

  if (options.file === null && process.stdin.isTTY) {
    fail('no file given and stdin is not piped (use --help for usage)', options.json);
  }

  let lines: string[];
  try {
    lines = readLines(options.file);
  } catch (err) {
    fail(`could not read ${options.file ?? 'stdin'}: ${(err as Error).message}`, options.json);
  }

  const format = options.format ? findFormatById(options.format) : detectFormat(lines);
  if (!format) {
    fail('no recognizable timestamps found in the first 50 lines', options.json);
  }

  const entries: TimestampedEntry[] = [];
  let prevMs: number | null = null;
  lines.forEach((lineText, idx) => {
    const time = extractTimestamp(lineText, format, prevMs);
    if (time !== null) {
      entries.push({ line: idx + 1, time });
      prevMs = time;
    }
  });

  const gaps = findGaps(entries, options.thresholdSeconds);

  if (options.json) {
    printJson(options, format.name, lines.length, entries, gaps);
  } else {
    printHuman(options, format.name, lines.length, entries, gaps);
  }
}

// Guard so importing this module (e.g. from tests, to reach parseArgs) doesn't
// also run the CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
