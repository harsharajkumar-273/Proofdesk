import { Request, Response } from 'express';
import { buildDependencyGraph } from '../services/dependencyGraphService.js';
import { getMonitoringContextFromRequest, recordMonitoringEvent } from '../services/monitoringService.js';
import logger from '../utils/logger.js';

export const getDependencyGraph = async (req: Request, res: Response): Promise<any> => {
  const sessionId = req.params.sessionId;

  if (typeof sessionId !== 'string' || !/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    logger.info(`Request received for workspace dependency graph: ${sessionId}`);
    const graphData = await buildDependencyGraph(sessionId);
    
    res.json({
      success: true,
      nodes: graphData.nodes,
      links: graphData.links,
    });
  } catch (error: any) {
    logger.error(`Failed to construct dependency graph for session ${sessionId}:`, error);
    
    await recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'dependency_graph_failure',
      message: error.message || 'Failed to construct dependency graph.',
      ...getMonitoringContextFromRequest(req),
      metadata: {
        sessionId,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : '',
      },
    });

    res.status(error.message === 'Workspace session not found' ? 404 : 500).json({
      success: false,
      error: 'Failed to construct dependency graph',
      details: error.message,
    });
  }
};
