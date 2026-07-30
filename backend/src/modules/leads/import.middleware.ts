import path from 'path';
import multer from 'multer';
import { env } from '@/config/env';
import { ApiError } from '@/utils/ApiError';

// CSV/Excel MIME types vary a lot across browsers and OSes (a Windows-saved
// CSV is often reported as 'application/vnd.ms-excel'), so this checks both
// MIME type and file extension and accepts if either looks right.
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

// Kept in memory (not written to /uploads) — this is a transient import
// source file, not a CRM document attached to a lead/company.
export const leadImportUpload = multer({
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
