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

  // Cancel the MathPix work if the client goes away, instead of letting it run
  // to completion against a socket nobody is listening on.
  //
  // This listens on the *response*, not the request: since Node 16 the request
  // stream emits 'close' as soon as its body has been consumed — which multer
  // does before this handler even runs — so req.on('close') fires on every
  // healthy request and would cancel imports that are working fine.
  // res 'close' with writableFinished still false means the socket went away
  // before we finished replying, which is an actual disconnect.
  const controller = new AbortController();
  let clientAborted = false;
  const onClientClose = () => {
    if (res.writableFinished) return;
    clientAborted = true;
    logger.info(`Client disconnected during PDF import of ${fileName}; cancelling`);
    controller.abort();
  };
  res.on('close', onClientClose);

  try {
    logger.info(`Received PDF import request for file: ${fileName}`);
    const pretextXml = await pdfImportService.importPdf(fileBuffer, fileName, {
      signal: controller.signal,
    });

    if (res.writableEnded) return;
    res.json({
      success: true,
      pretext: pretextXml,
      mathPixConfigured: pdfImportService.isMathPixConfigured(),
    });
  } catch (error: any) {
    // The client hung up: nothing to respond to, and this is not a server fault.
    if (clientAborted || res.writableEnded) {
      return;
    }

    if (error instanceof pdfImportService.ImportAbortedError && error.reason === 'timeout') {
      logger.warn(`PDF import timed out for file ${fileName}`);
      await recordMonitoringEvent({
        source: 'backend',
        level: 'warn',
        category: 'pdf_import_timeout',
        message: error.message,
        metadata: { fileName },
      });
      return res.status(504).json({
        success: false,
        error: 'Conversion timed out',
        details: error.message,
      });
    }

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
  } finally {
    res.removeListener('close', onClientClose);
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
