export interface TimestampedEntry {
  line: number;
  time: number;
}

export interface Gap {
  fromLine: number;
  toLine: number;
  fromTime: number;
  toTime: number;
  seconds: number;
}

export function findGaps(entries: TimestampedEntry[], thresholdSeconds: number): Gap[] {
  const gaps: Gap[] = [];
  const thresholdMs = thresholdSeconds * 1000;

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const deltaMs = curr.time - prev.time;
    if (deltaMs >= thresholdMs) {
      gaps.push({
        fromLine: prev.line,
        toLine: curr.line,
        fromTime: prev.time,
        toTime: curr.time,
        seconds: deltaMs / 1000,
      });
    }
  }

  return gaps;
}
