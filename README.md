# logcadence

Find gaps in a log file's timeline.

When something hangs — a deadlock, a long GC pause, a process that
crashed and took a few seconds to restart — the log often stays quiet
instead of printing an error. Grepping for `ERROR` or `FATAL` finds
nothing, because nothing got logged. What you actually want to know is:
"where did this file go silent for longer than it should have?"

`logcadence` reads a log file, figures out its timestamp format, and
reports every gap between consecutive log lines that's larger than a
threshold you choose.

## Usage

```
logcadence <file> [--threshold seconds] [--json]
```

Human-readable output:

```
$ logcadence app.log --threshold 10
log: app.log
format detected: ISO 8601
lines scanned: 48213 (48210 with timestamps)
time span: 2026-01-01T00:00:00.012Z -> 2026-01-01T06:12:44.900Z (22364.9s)
gaps >= 10s: 2
  line 19042 -> 19043   41.7s   2026-01-01T02:03:11.100Z -> 2026-01-01T02:03:52.800Z
  line 33110 -> 33111   14.2s   2026-01-01T04:41:02.000Z -> 2026-01-01T04:41:16.200Z
longest gap: 41.7s (line 19042 -> 19043)
```

Same run, machine-readable:

```
$ logcadence app.log --threshold 10 --json
{
  "file": "app.log",
  "format": "ISO 8601",
  "thresholdSeconds": 10,
  "totalLines": 48213,
  "timestampedLines": 48210,
  "firstTimestamp": "2026-01-01T00:00:00.012Z",
  "lastTimestamp": "2026-01-01T06:12:44.900Z",
  "spanSeconds": 22364.9,
  "gaps": [
    { "fromLine": 19042, "toLine": 19043, "fromTime": "2026-01-01T02:03:11.100Z", "toTime": "2026-01-01T02:03:52.800Z", "seconds": 41.7 },
    { "fromLine": 33110, "toLine": 33111, "fromTime": "2026-01-01T04:41:02.000Z", "toTime": "2026-01-01T04:41:16.200Z", "seconds": 14.2 }
  ],
  "longestGap": { "fromLine": 19042, "toLine": 19043, "seconds": 41.7 }
}
```

The `--json` mode is meant to be piped into `jq` or fed to another
tool — it's the same data as the table, just structured, and it's the
one you'd wire into a CI check or a monitoring script.

## Supported timestamp formats

Format detection runs against the first 50 lines of the file and picks
whichever format matches the most of them, so there's no `--format`
flag to set by hand:

- ISO 8601 (`2026-01-01T00:00:00.012Z`, with or without a `T`/space
  separator, milliseconds, or a numeric offset)
- Apache/nginx combined log format (`[10/Oct/2000:13:55:36 -0700]`)
- syslog, RFC 3164 (`Jan  1 00:00:00`) — this format doesn't carry a
  year, so the current calendar year is assumed. Files that cross a
  New Year's boundary, or that were written in a non-UTC local time,
  will get somewhat wrong gap sizes near the boundary.

Lines that don't match the detected format are counted but skipped
when computing gaps.

## Building

Standard library only, no dependencies to install:

```
npx tsc
node dist/index.js app.log
```

## Roadmap

See the repository's commit history and issues for what's planned next.
