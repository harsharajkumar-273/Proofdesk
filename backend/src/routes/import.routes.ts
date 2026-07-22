import { Router } from 'express';
import multer from 'multer';
import { requireAccessToken } from '../middleware/auth.js';
import { importRateLimiter } from '../middleware/rateLimit.js';
import {
  importPdf,
  importText,
  getImportConfig,
} from '../controllers/import.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB max file size
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.toLowerCase() !== 'application/pdf') {
      return cb(new Error('Invalid file MIME type: expected application/pdf'));
    }
    cb(null, true);
  },
});

export default function createImportRouter(): Router {
  const router = Router();

  // PDF conversion endpoint (multipart) with rate limiting
  router.post(
    '/import/pdf',
    requireAccessToken,
    importRateLimiter,
    upload.single('file'),
    importPdf
  );

  // Raw LaTeX / Markdown text conversion endpoint with rate limiting
  router.post(
    '/import/text',
    requireAccessToken,
    importRateLimiter,
    importText
  );

  // Check MathPix configuration status
  router.get(
    '/import/config',
    requireAccessToken,
    getImportConfig
  );

  return router;
}
