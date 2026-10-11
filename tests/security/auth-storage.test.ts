import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLoginFailures, loginGate, recordLoginFailure } from '../../server/services/loginSecurity.js';
import { resolveStoredUpload } from '../../server/services/storage.js';
import { analyzeAttendancePhoto, hammingDistance } from '../../server/services/imageAnalysis.js';

test('login gate blocks repeated failures and can be cleared after a successful login', () => {
  const key = `security-test-${Date.now()}`;
  clearLoginFailures(key);
  for (let attempt = 0; attempt < 5; attempt += 1) recordLoginFailure(key);
  assert.equal(loginGate(key).allowed, false);
  clearLoginFailures(key);
  assert.equal(loginGate(key).allowed, true);
});

test('stored media resolver rejects traversal and accepts a legacy uploads path', () => {
  assert.equal(resolveStoredUpload('../package.json'), undefined);
  assert.ok(resolveStoredUpload('uploads/legacy-photo.jpg'));
});

test('attendance analysis hashes Base64 image bytes and exposes dimensions', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const analysis = analyzeAttendancePhoto(png, '0123456789abcdef');
  assert.equal(analysis.photoMimeType, 'image/png');
  assert.equal(analysis.photoWidth, 1);
  assert.equal(analysis.photoHeight, 1);
  assert.match(analysis.photoPerceptualHash ?? '', /^[0-9a-f]{16}$/);
  assert.notEqual(analysis.photoPerceptualHash, '0123456789abcdef');
  assert.equal(analysis.photoHash.length, 64);
  assert.equal(hammingDistance('0000000000000000', '0000000000000001'), 1);
});
