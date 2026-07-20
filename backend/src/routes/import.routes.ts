import { Router } from 'express';
import multer from 'multer';
import { requireAccessToken } from '../middleware/auth.js';
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
});

export default function createImportRouter(): Router {
  const router = Router();

  // PDF conversion endpoint (multipart)
  router.post(
    '/import/pdf',
    requireAccessToken,
    upload.single('file'),
    importPdf
  );

  // Raw LaTeX / Markdown text conversion endpoint
  router.post(
    '/import/text',
    requireAccessToken,
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
