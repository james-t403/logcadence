// Timestamp extraction for the log formats we actually run into day to day.
// Each format is tried in turn against a sample of lines; whichever matches
// the most wins, so most files work without needing --format at all.

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export interface TimestampFormat {
  id: string;
  name: string;
  regex: RegExp;
  // prevMs is the timestamp of the previous line that matched this same
  // format, if any. Only syslog uses it (to carry the year forward and
  // detect a New Year's rollover); other formats ignore it.
  parse: (match: RegExpMatchArray, prevMs: number | null) => number | null;
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

// If a syslog line's timestamp lands more than this far before the
// previous line's, it isn't just an out-of-order log entry -- the year
// must have rolled over (e.g. "Dec 31" followed by "Jan 1"), so we bump
// the year forward by one and recompute.
const SYSLOG_ROLLOVER_THRESHOLD_MS = 180 * 24 * 60 * 60_000;

function parseSyslog(match: RegExpMatchArray, prevMs: number | null): number | null {
  const [, monStr, dayStr, hourStr, minStr, secStr] = match;
  const month = MONTHS[monStr];
  if (month === undefined) return null;

  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);
  const second = Number(secStr);

  // RFC 3164 syslog lines carry no year or zone, and we treat them as UTC,
  // which is wrong for logs written in local time; see README. For the
  // year, start from wherever the previous line landed (or the current
  // calendar year for the first line) and only advance it when the new
  // timestamp would otherwise fall well before the previous one -- that's
  // the signature of a real New Year's rollover, not just jitter.
  const baseYear = prevMs === null ? new Date().getFullYear() : new Date(prevMs).getUTCFullYear();
  const candidateMs = Date.UTC(baseYear, month, day, hour, minute, second);

  if (prevMs !== null && candidateMs < prevMs - SYSLOG_ROLLOVER_THRESHOLD_MS) {
    return Date.UTC(baseYear + 1, month, day, hour, minute, second);
  }

  return candidateMs;
}

export const FORMATS: TimestampFormat[] = [
  {
    id: 'iso8601',
    name: 'ISO 8601',
    regex: /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
    parse: parseIso,
  },
  {
    id: 'apache',
    name: 'Apache/nginx combined',
    regex: /\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]/,
    parse: parseApache,
  },
  {
    id: 'syslog',
    name: 'syslog (RFC 3164)',
    regex: /^([A-Za-z]{3})\s+(\d{1,2})\s(\d{2}):(\d{2}):(\d{2})/,
    parse: parseSyslog,
  },
];

export function findFormatById(id: string): TimestampFormat | null {
  return FORMATS.find((format) => format.id === id) ?? null;
}

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

export function extractTimestamp(line: string, format: TimestampFormat, prevMs: number | null = null): number | null {
  const match = line.match(format.regex);
  if (!match) return null;
  return format.parse(match, prevMs);
}
