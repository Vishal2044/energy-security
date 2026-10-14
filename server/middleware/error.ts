import type { ErrorRequestHandler, Request, Response } from 'express';
import { UploadValidationError } from '../services/storage.js';
import { PaginationError } from '../services/pagination.js';
export const notFound = (_req: Request, res: Response) => res.status(404).json({ success: false, error: 'NOT_FOUND' });
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof PaginationError) return res.status(400).json({ success: false, error: error.message });
  if (error instanceof UploadValidationError) return res.status(400).json({ success: false, error: error.message });
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'FILE_TOO_LARGE' });
  if (error?.type === 'entity.too.large' || error?.status === 413) return res.status(413).json({ success: false, error: 'PAYLOAD_TOO_LARGE' });
  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern ?? error.keyValue ?? {});
    return res.status(409).json({ success: false, error: fields.includes('clientRecordId') ? 'CLIENT_RECORD_CONFLICT' : fields.includes('guardId') && fields.includes('status') ? 'SHIFT_ALREADY_ACTIVE' : 'DUPLICATE_RECORD' });
  }
  console.error(JSON.stringify({ event: 'api_request_failed', requestId: res.locals.requestId ?? req.get('x-request-id'), method: req.method, path: req.path, error: error instanceof Error ? error.message : String(error) }));
  return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
};
