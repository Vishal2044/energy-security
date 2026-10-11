export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const DAY_MS = 24 * 60 * 60 * 1000;
const INDIA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function shiftedIndiaDate(instant: Date): Date {
  // These helpers cover modern operational records, not historic timezone rules.
  // Restrict the supported range instead of silently misdating older records.
  const time = instant.getTime();
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError('Expected a valid instant on or after 1970-01-01 UTC.');
  }
  const shifted = new Date(time + INDIA_OFFSET_MS);
  if (!Number.isFinite(shifted.getTime()) || shifted.getUTCFullYear() > 9999) {
    throw new RangeError('India business date must be within years 1970 through 9999.');
  }
  return shifted;
}

/** YYYY-MM-DD in India, independent of the device/server timezone. */
export function indiaBusinessDate(instant: Date): string {
  return shiftedIndiaDate(instant).toISOString().slice(0, 10);
}

/** UTC [start, end) for the India calendar day containing the supplied instant. */
export function indiaDayUtcRange(instant: Date): { start: Date; end: Date } {
  const shifted = shiftedIndiaDate(instant);
  shifted.setUTCHours(0, 0, 0, 0);
  const startTime = shifted.getTime() - INDIA_OFFSET_MS;
  return { start: new Date(startTime), end: new Date(startTime + DAY_MS) };
}
