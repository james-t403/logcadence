import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGaps } from './gaps.js';

test('findGaps returns nothing for fewer than two entries', () => {
  assert.deepEqual(findGaps([], 5), []);
  assert.deepEqual(findGaps([{ line: 1, time: 0 }], 5), []);
});

test('findGaps ignores deltas under the threshold', () => {
  const entries = [
    { line: 1, time: 0 },
    { line: 2, time: 2000 },
    { line: 3, time: 3500 },
  ];
  assert.deepEqual(findGaps(entries, 5), []);
});

test('findGaps reports a gap exactly at the threshold', () => {
  const entries = [
    { line: 1, time: 0 },
    { line: 2, time: 5000 },
  ];
  const gaps = findGaps(entries, 5);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].seconds, 5);
});

test('findGaps reports every gap over the threshold, in order', () => {
  const entries = [
    { line: 1, time: 0 },
    { line: 2, time: 1000 },
    { line: 3, time: 21000 },
    { line: 4, time: 22000 },
    { line: 5, time: 52000 },
  ];
  const gaps = findGaps(entries, 10);
  assert.equal(gaps.length, 2);
  assert.deepEqual(
    gaps.map((g) => [g.fromLine, g.toLine]),
    [[2, 3], [4, 5]],
  );
  assert.equal(gaps[0].seconds, 20);
  assert.equal(gaps[1].seconds, 30);
});

test('findGaps uses the original line numbers, not array indices', () => {
  // entries skip lines 2 and 4 because those lines had no timestamp
  const entries = [
    { line: 1, time: 0 },
    { line: 3, time: 15000 },
    { line: 5, time: 16000 },
  ];
  const gaps = findGaps(entries, 10);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].fromLine, 1);
  assert.equal(gaps[0].toLine, 3);
});
