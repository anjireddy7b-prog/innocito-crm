import path from 'path';
import multer from 'multer';
import { env } from '@/config/env';
import { ApiError } from '@/utils/ApiError';

/**
 * Generic CSV/Excel upload middleware for any bulk-import endpoint — split out of
 * modules/leads/import.middleware.ts (which predates this and still has its own identically-
 * configured `leadImportUpload`, left as-is to avoid touching already-tested lead import code)
 * so a second module (companies) doesn't have to import something named "lead" to get the same
 * multer setup. Kept in memory (not written to /uploads) — this is a transient import source
 * file, not a CRM document attached to a record.
 */
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

export const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype || ext}. Upload a .csv or .xlsx file.`) as unknown as Error);
    }
    cb(null, true);
  },
});
