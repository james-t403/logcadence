import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './index.js';

test('parseArgs defaults to auto-detection with no --format given', () => {
  const options = parseArgs(['app.log']);
  assert.equal(options.format, null);
});

test('parseArgs accepts a known --format id', () => {
  const options = parseArgs(['app.log', '--format', 'syslog']);
  assert.equal(options.format, 'syslog');
});

test('parseArgs rejects an unknown --format id', () => {
  assert.throws(() => parseArgs(['app.log', '--format', 'made-up']), /unknown format/);
});

test('parseArgs requires a value after --format', () => {
  assert.throws(() => parseArgs(['app.log', '--format']), /--format requires a value/);
});

test('parseArgs combines --format with other options', () => {
  const options = parseArgs(['app.log', '--format', 'apache', '--threshold', '10', '--json']);
  assert.equal(options.format, 'apache');
  assert.equal(options.thresholdSeconds, 10);
  assert.equal(options.json, true);
});
