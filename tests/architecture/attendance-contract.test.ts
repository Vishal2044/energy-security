import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendancePayloadSchema, MAX_ATTENDANCE_PHOTO_BASE64_LENGTH } from '../../shared/attendance.js';

test('legacy photo-only and currently optional fields remain accepted', () => {
  assert.deepEqual(attendancePayloadSchema.parse({ photo: 'legacy-photo' }), { photo: 'legacy-photo' });
  const payload = {
    photo: 'data:image/jpeg;base64,example',
    capturedAt: '2026-10-10T18:29:59.999Z',
    clientRecordId: '',
    verificationRequestId: '',
    notes: 'a'.repeat(500),
  };
  assert.deepEqual(attendancePayloadSchema.parse(payload), payload);
});

test('invalid attendance and unsolicited location fields remain rejected', () => {
  for (const payload of [
    {}, { photo: '' }, { photo: 123 },
    { photo: 'image', capturedAt: '2026-10-10' },
    { photo: 'image', notes: 'a'.repeat(501) },
    { photo: 'image', latitude: 22 },
    { photo: 'image', longitude: 70 },
    { photo: 'image', accuracy: 10 },
    { photo: 'image', guardId: 'another-guard' },
    { photo: 'image', siteId: 'another-site' },
    { photo: 'image', status: 'VERIFIED' },
  ]) {
    assert.equal(attendancePayloadSchema.safeParse(payload).success, false);
  }
});

test('attendance payloads reject Base64 bodies above the supported image contract', () => {
  assert.equal(attendancePayloadSchema.safeParse({ photo: 'x'.repeat(MAX_ATTENDANCE_PHOTO_BASE64_LENGTH + 1) }).success, false);
});
