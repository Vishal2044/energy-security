import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { env } from '../config/env.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 6000;
const MIME_EXTENSIONS: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
export class UploadValidationError extends Error { constructor(message = 'INVALID_UPLOAD') { super(message); this.name = 'UploadValidationError'; } }

function detectedMime(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}
function imageDimensions(buffer: Buffer, mime: string) {
  if (mime === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mime === 'image/gif' && buffer.length >= 10) return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (mime === 'image/webp' && buffer.length >= 30 && buffer.subarray(12, 16).toString('ascii') === 'VP8X') return { width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16), height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16) };
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && offset + 8 < buffer.length) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      if (!length) break;
      offset += 2 + length;
    }
  }
  return undefined;
}
function validateFile(file: Express.Multer.File) {
  if (!file?.buffer?.length || file.size > MAX_FILE_SIZE) throw new UploadValidationError('FILE_TOO_LARGE');
  const actual = detectedMime(file.buffer);
  if (!actual || !MIME_EXTENSIONS[actual] || (file.mimetype && file.mimetype !== actual)) throw new UploadValidationError('FILE_TYPE_INVALID');
  if (actual.startsWith('image/')) {
    const dimensions = imageDimensions(file.buffer, actual);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) throw new UploadValidationError('IMAGE_DIMENSIONS_INVALID');
  }
  return actual;
}

export async function saveLocalUpload(file: Express.Multer.File) {
  const mimeType = validateFile(file);
  await fs.mkdir(env.mediaStorageRoot, { recursive: true, mode: 0o750 });
  const safeName = String(file.originalname ?? 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
  const extension = MIME_EXTENSIONS[mimeType];
  const target = path.join(env.mediaStorageRoot, `${randomUUID()}${extension}`);
  await fs.writeFile(target, file.buffer, { flag: 'wx', mode: 0o640 });
  return { storageKey: target, originalName: safeName || `upload${extension}`, mimeType, size: file.size };
}

const storageRoots = () => [...new Set([path.resolve(env.mediaStorageRoot), path.resolve('uploads')])];
export function resolveStoredUpload(storageKey: string) {
  const candidate = path.resolve(storageKey);
  return storageRoots().some((root) => candidate.startsWith(`${root}${path.sep}`)) ? candidate : undefined;
}
export async function deleteLocalUpload(storageKey?: string) {
  const resolved = storageKey ? resolveStoredUpload(storageKey) : undefined;
  if (resolved) await fs.rm(resolved, { force: true });
}
