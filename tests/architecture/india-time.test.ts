import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indiaBusinessDate, indiaDayUtcRange } from '../../shared/time.js';

test('India midnight uses a half-open UTC interval across year end', () => {
  const before = new Date('2026-12-31T18:29:59.999Z');
  const midnight = new Date('2026-12-31T18:30:00.000Z');
  assert.equal(indiaBusinessDate(before), '2026-12-31');
  assert.equal(indiaBusinessDate(midnight), '2027-01-01');
  const range = indiaDayUtcRange(midnight);
  assert.equal(range.start.toISOString(), '2026-12-31T18:30:00.000Z');
  assert.equal(range.end.toISOString(), '2027-01-01T18:30:00.000Z');
  assert.equal(indiaDayUtcRange(before).end.getTime(), midnight.getTime());
  assert.ok(before < range.start);
  assert.ok(midnight >= range.start && midnight < range.end);
});

test('leap-day boundaries do not mutate input or reuse mutable result objects', () => {
  const instant = new Date('2028-02-28T18:30:00.000Z');
  const original = instant.getTime();
  assert.equal(indiaBusinessDate(instant), '2028-02-29');
  const first = indiaDayUtcRange(instant);
  assert.equal(first.end.toISOString(), '2028-02-29T18:30:00.000Z');
  first.start.setUTCFullYear(2000);
  assert.equal(instant.getTime(), original);
  assert.equal(indiaDayUtcRange(instant).start.toISOString(), '2028-02-28T18:30:00.000Z');
});

test('invalid and unsupported historical dates fail explicitly', () => {
  for (const instant of [new Date(NaN), new Date('1969-12-31T23:59:59.999Z'), new Date('10000-01-01T00:00:00Z')]) {
    assert.throws(() => indiaBusinessDate(instant), RangeError);
    assert.throws(() => indiaDayUtcRange(instant), RangeError);
  }
});
