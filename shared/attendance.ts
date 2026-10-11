import { z } from 'zod';

export const MAX_ATTENDANCE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ATTENDANCE_PHOTO_BASE64_LENGTH = Math.ceil(MAX_ATTENDANCE_IMAGE_BYTES * 4 / 3) + 512;

// Existing request contract, extracted without tightening legacy validation.
// A client timestamp is reported evidence; it is not proof of presence.
export const attendancePayloadSchema = z
  .object({
    capturedAt: z.string().datetime().optional(),
    clientRecordId: z.string().optional(),
    verificationRequestId: z.string().optional(),
    photo: z.string().min(1).max(MAX_ATTENDANCE_PHOTO_BASE64_LENGTH),
    notes: z.string().max(500).optional(),
    perceptualHash: z.string().regex(/^[0-9a-f]{16,128}$/i).optional(),
    clientQueuedAt: z.string().datetime().optional(),
  })
  .strict();

export type AttendancePayload = z.infer<typeof attendancePayloadSchema>;
