// Timestamp extraction for the log formats we actually run into day to day.
// Each format is tried in turn against a sample of lines; whichever matches
// the most wins, so a file doesn't need a --format flag for the common cases.

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export interface TimestampFormat {
  name: string;
  regex: RegExp;
  parse: (match: RegExpMatchArray) => number | null;
}

function parseIso(match: RegExpMatchArray): number | null {
  const normalized = match[1].replace(' ', 'T');
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

function parseApache(match: RegExpMatchArray): number | null {
  const [, dayStr, monStr, yearStr, hourStr, minStr, secStr, offset] = match;
  const month = MONTHS[monStr];
  if (month === undefined) return null;

  const day = Number(dayStr);
  const year = Number(yearStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);
  const second = Number(secStr);

  const offsetSign = offset[0] === '-' ? -1 : 1;
  const offsetMinutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5));
  const offsetMs = offsetSign * offsetMinutes * 60_000;

  const utcMs = Date.UTC(year, month, day, hour, minute, second);
  return utcMs - offsetMs;
}

function parseSyslog(match: RegExpMatchArray): number | null {
  const [, monStr, dayStr, hourStr, minStr, secStr] = match;
  const month = MONTHS[monStr];
  if (month === undefined) return null;

  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);
  const second = Number(secStr);

  // RFC 3164 syslog lines carry no year or zone. We assume the current
  // year and UTC, which is wrong for logs spanning a New Year's boundary
  // or written in local time. Good enough for a first pass; see README.
  const year = new Date().getFullYear();
  return Date.UTC(year, month, day, hour, minute, second);
}

export const FORMATS: TimestampFormat[] = [
  {
    name: 'ISO 8601',
    regex: /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
    parse: parseIso,
  },
  {
    name: 'Apache/nginx combined',
    regex: /\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]/,
    parse: parseApache,
  },
  {
    name: 'syslog (RFC 3164)',
    regex: /^([A-Za-z]{3})\s+(\d{1,2})\s(\d{2}):(\d{2}):(\d{2})/,
    parse: parseSyslog,
  },
];

export function detectFormat(lines: string[]): TimestampFormat | null {
  const sample = lines.slice(0, 50);
  let best: { format: TimestampFormat; count: number } | null = null;

  for (const format of FORMATS) {
    const count = sample.filter((line) => format.regex.test(line)).length;
    if (count > 0 && (!best || count > best.count)) {
      best = { format, count };
    }
  }

  return best ? best.format : null;
}

export function extractTimestamp(line: string, format: TimestampFormat): number | null {
  const match = line.match(format.regex);
  if (!match) return null;
  return format.parse(match);
}
