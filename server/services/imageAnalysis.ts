import { createHash } from "node:crypto";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

export type AttendanceReviewFlag = {
  code: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  relatedAttendanceIds?: string[];
};

export type AttendancePhotoAnalysis = {
  photoHash: string;
  photoPerceptualHash?: string;
  photoMimeType?: string;
  photoByteSize: number;
  photoWidth?: number;
  photoHeight?: number;
  exifCapturedAt?: string;
};

function decodePhoto(photo: string) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(photo);
  if (!match) throw new Error("INVALID_IMAGE_DATA");
  const mimeType = match[1].toLowerCase();
  if (!["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"].includes(mimeType)) throw new Error("INVALID_IMAGE_DATA");
  const buffer = Buffer.from(match[2], "base64");
  const validMagic = (["image/jpeg", "image/jpg"].includes(mimeType) && buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (mimeType === "image/png" && buffer.toString("ascii", 1, 4) === "PNG") ||
    (mimeType === "image/gif" && buffer.toString("ascii", 0, 3) === "GIF") ||
    (mimeType === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP");
  if (!validMagic) throw new Error("INVALID_IMAGE_DATA");
  return { mimeType, buffer };
}

function jpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function imageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  return ["image/jpeg", "image/jpg"].includes(mimeType) ? jpegDimensions(buffer) : undefined;
}

type RasterImage = { width: number; height: number; data: Uint8Array };

function decodeRaster(buffer: Buffer, mimeType: string): RasterImage | undefined {
  try {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      const decoded = decodeJpeg(buffer, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 36, maxMemoryUsageInMB: 96 });
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    }
    if (mimeType === "image/png") {
      const decoded = PNG.sync.read(buffer);
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function perceptualHash(raster?: RasterImage) {
  if (!raster || raster.width < 1 || raster.height < 1) return undefined;
  const bits: string[] = [];
  for (let row = 0; row < 8; row += 1) {
    const y = Math.min(raster.height - 1, Math.floor(row * raster.height / 8));
    for (let column = 0; column < 8; column += 1) {
      const leftX = Math.min(raster.width - 1, Math.floor(column * raster.width / 9));
      const rightX = Math.min(raster.width - 1, Math.floor((column + 1) * raster.width / 9));
      const left = (y * raster.width + leftX) * 4;
      const right = (y * raster.width + rightX) * 4;
      const leftGray = raster.data[left] * 0.299 + raster.data[left + 1] * 0.587 + raster.data[left + 2] * 0.114;
      const rightGray = raster.data[right] * 0.299 + raster.data[right + 1] * 0.587 + raster.data[right + 2] * 0.114;
      bits.push(leftGray > rightGray ? "1" : "0");
    }
  }
  let hash = "";
  for (let index = 0; index < bits.length; index += 4) hash += Number.parseInt(bits.slice(index, index + 4).join(""), 2).toString(16);
  return hash;
}

function exifDate(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1 && buffer.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
      const tiff = offset + 10;
      const little = buffer.toString("ascii", tiff, tiff + 2) === "II";
      const u16 = (at: number) => little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
      const u32 = (at: number) => little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
      const base = tiff;
      const ifdOffset = base + u32(base + 4);
      if (ifdOffset + 2 > buffer.length) return undefined;
      const count = u16(ifdOffset);
      for (let index = 0; index < count; index += 1) {
        const entry = ifdOffset + 2 + index * 12;
        if (entry + 12 > buffer.length || u16(entry) !== 0x9003) continue;
        const type = u16(entry + 2);
        const countValue = u32(entry + 4);
        if (type !== 2 || countValue < 10) return undefined;
        const valueOffset = countValue <= 4 ? entry + 8 : base + u32(entry + 8);
        const value = buffer.toString("ascii", valueOffset, valueOffset + countValue).replace(/\0+$/, "");
        const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
        if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
      }
      return undefined;
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return undefined;
}

export function hammingDistance(left?: string, right?: string) {
  if (!left || !right || left.length !== right.length || !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return undefined;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

export function analyzeAttendancePhoto(photo: string, _clientPerceptualHash?: string): AttendancePhotoAnalysis {
  const { mimeType, buffer } = decodePhoto(photo);
  if (!buffer.length) throw new Error("INVALID_IMAGE_DATA");
  const dimensions = imageDimensions(buffer, mimeType);
  if (dimensions && (dimensions.width > 6000 || dimensions.height > 6000)) throw new Error("IMAGE_DIMENSIONS_INVALID");
  const raster = decodeRaster(buffer, mimeType);
  return {
    photoHash: createHash("sha256").update(buffer).digest("hex"),
    photoPerceptualHash: perceptualHash(raster),
    photoMimeType: mimeType,
    photoByteSize: buffer.length,
    photoWidth: dimensions?.width,
    photoHeight: dimensions?.height,
    exifCapturedAt: exifDate(buffer),
  };
}

export function reviewFlag(code: string, severity: AttendanceReviewFlag["severity"], message: string, relatedAttendanceIds?: string[]): AttendanceReviewFlag {
  return { code, severity, message, ...(relatedAttendanceIds?.length ? { relatedAttendanceIds } : {}) };
}
