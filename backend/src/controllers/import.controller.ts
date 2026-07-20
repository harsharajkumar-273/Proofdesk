import { Request, Response } from 'express';
import * as pdfImportService from '../services/pdfImportService.js';
import { recordMonitoringEvent } from '../services/monitoringService.js';
import logger from '../utils/logger.js';

export const importPdf = async (req: Request, res: Response): Promise<any> => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const fileName = req.file.originalname || 'uploaded.pdf';
  const fileBuffer = req.file.buffer;

  try {
    logger.info(`Received PDF import request for file: ${fileName}`);
    const pretextXml = await pdfImportService.importPdf(fileBuffer, fileName);
    
    res.json({
      success: true,
      pretext: pretextXml,
      mathPixConfigured: pdfImportService.isMathPixConfigured(),
    });
  } catch (error: any) {
    logger.error(`PDF Import controller failed for file ${fileName}:`, error);
    
    await recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'pdf_import_failure',
      message: error.message || 'PDF import failed.',
      metadata: {
        fileName,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : '',
      },
    });

    res.status(500).json({
      success: false,
      error: 'Conversion failed',
      details: error.message,
    });
  }
};

export const importText = async (req: Request, res: Response): Promise<any> => {
  const { content } = req.body;

  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty text content' });
  }

  try {
    logger.info(`Received text/LaTeX import request`);
    const pretextXml = pdfImportService.importText(content);
    
    res.json({
      success: true,
      pretext: pretextXml,
    });
  } catch (error: any) {
    logger.error(`Text Import controller failed:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Text conversion failed',
      details: error.message,
    });
  }
};

export const getImportConfig = async (req: Request, res: Response): Promise<any> => {
  res.json({
    success: true,
    mathPixConfigured: pdfImportService.isMathPixConfigured(),
  });
};
