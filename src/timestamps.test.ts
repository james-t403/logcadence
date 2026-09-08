import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, detectFormat, extractTimestamp } from './timestamps.js';

const iso = FORMATS.find((f) => f.name === 'ISO 8601')!;
const apache = FORMATS.find((f) => f.name === 'Apache/nginx combined')!;
const syslog = FORMATS.find((f) => f.name === 'syslog (RFC 3164)')!;

test('extractTimestamp parses ISO 8601 with a T separator and Z', () => {
  const ms = extractTimestamp('2026-01-01T00:00:00.012Z app started', iso);
  assert.equal(ms, Date.parse('2026-01-01T00:00:00.012Z'));
});

test('extractTimestamp parses ISO 8601 with a space separator and no millis', () => {
  const ms = extractTimestamp('2026-01-01 06:12:44Z shutting down', iso);
  assert.equal(ms, Date.parse('2026-01-01T06:12:44Z'));
});

test('extractTimestamp parses ISO 8601 with a numeric offset', () => {
  const ms = extractTimestamp('2026-01-01T00:00:00+02:00 event', iso);
  assert.equal(ms, Date.parse('2026-01-01T00:00:00+02:00'));
});

test('extractTimestamp parses Apache/nginx combined log timestamps', () => {
  const line = '127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.0" 200 2326';
  const ms = extractTimestamp(line, apache);
  assert.equal(ms, Date.UTC(2000, 9, 10, 13, 55, 36) + 7 * 60 * 60_000);
});

test('extractTimestamp parses syslog RFC 3164 timestamps against the current year', () => {
  const ms = extractTimestamp('Jan  1 00:00:00 host sshd[123]: accepted', syslog);
  const year = new Date().getFullYear();
  assert.equal(ms, Date.UTC(year, 0, 1, 0, 0, 0));
});

test('extractTimestamp returns null when the line does not match', () => {
  assert.equal(extractTimestamp('no timestamp here', iso), null);
  assert.equal(extractTimestamp('no timestamp here', apache), null);
  assert.equal(extractTimestamp('no timestamp here', syslog), null);
});

test('detectFormat picks the format matching the most sample lines', () => {
  const lines = [
    '2026-01-01T00:00:00.000Z line one',
    '2026-01-01T00:00:01.000Z line two',
    'not a timestamp at all',
  ];
  assert.equal(detectFormat(lines)?.name, 'ISO 8601');
});

test('detectFormat only samples the first 50 lines', () => {
  const noise = Array.from({ length: 50 }, (_, i) => `plain line ${i}`);
  const lines = [...noise, '2026-01-01T00:00:00.000Z too late to count'];
  assert.equal(detectFormat(lines), null);
});

test('detectFormat returns null when nothing matches', () => {
  assert.equal(detectFormat(['just text', 'more text']), null);
});
