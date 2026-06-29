import { Queue, Worker, Job } from 'bullmq';
import { isRedisSharedStateEnabled } from '../utils/redisClient.js';
import buildExecutor from './buildExecutor.js';
import workspaceRepository from '../repositories/workspace.repository.js';
import logger from '../utils/logger.js';
import { traceAsync } from '../otel.js';

const QUEUE_NAME = 'build-queue';

const getRedisConnectionOptions = () => {
  const url = process.env.PROOFDESK_REDIS_URL || '';
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
};

const connectionOptions = getRedisConnectionOptions() as any;

export const buildQueue = isRedisSharedStateEnabled()
  ? new Queue(QUEUE_NAME, { connection: connectionOptions })
  : null;

// ── In-Process Local Fallback Queue ──
class InProcessBuildQueue {
  private queue: Array<{ sessionId: string; options: any; resolve: (val: any) => void; reject: (err: any) => void }> = [];
  private running = false;

  async add(sessionId: string, options: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ sessionId, options, resolve, reject });
      void this.processNext();
    });
  }

  private async processNext() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const job = this.queue.shift();
    if (!job) {
      this.running = false;
      return;
    }

    const { sessionId, options, resolve, reject } = job;
    const traceParent = options?.traceParent;

    try {
      const result = await traceAsync(`local_queue:compile:${options?.xmlId || 'full'}`, async (span) => {
        span.setAttribute('sessionId', sessionId);
        
        await ensureSessionHydrated(sessionId);

        const buildResult = await buildExecutor.build(sessionId, { 
          ...options, 
          traceParent: traceParent || `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01` 
        });

        buildExecutor._finishLog(sessionId, buildResult);
        return buildResult;
      }, traceParent);

      resolve(result);
    } catch (error: any) {
      const errResult = {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        sessionId,
      };
      buildExecutor._finishLog(sessionId, errResult);
      reject(error);
    } finally {
      this.running = false;
      void this.processNext();
    }
  }
}

const localQueue = new InProcessBuildQueue();

const ensureSessionHydrated = async (sessionId: string) => {
  if (!buildExecutor.sessions.has(sessionId)) {
    const dbSession = await workspaceRepository.getSession(sessionId);
    if (dbSession) {
      buildExecutor.sessions.set(sessionId, {
        id: dbSession.id,
        owner: dbSession.owner,
        repo: dbSession.repo,
        branch: dbSession.branch,
        repoPath: dbSession.repoPath,
        outputPath: dbSession.outputPath,
        previewPath: dbSession.previewPath,
        creatorLogin: dbSession.creatorLogin,
        notifyEmail: dbSession.notifyEmail,
        commitHash: dbSession.commitHash,
        localTestMode: false,
      });
    } else {
      throw new Error(`Session ${sessionId} not found in database`);
    }
  }
};

export const pushBuildJob = async (sessionId: string, options: { xmlId?: string | null; traceParent?: string | null } = {}): Promise<boolean> => {
  if (isRedisSharedStateEnabled() && buildQueue) {
    logger.info(`Pushing build job to Redis queue for session ${sessionId}`, { sessionId, options });
    await buildQueue.add('compile', { sessionId, options }, {
      removeOnComplete: true,
      removeOnFail: true,
    });
    return true;
  } else {
    logger.info(`Pushing build job to in-process local queue for session ${sessionId}`, { sessionId, options });
    localQueue.add(sessionId, options).catch((err) => {
      logger.error(`Local in-process queue job failed for session ${sessionId}`, err);
    });
    return true;
  }
};

export let buildWorker: Worker | null = null;

export const startBuildWorker = (): void => {
  if (!isRedisSharedStateEnabled()) {
    logger.info('Redis not enabled. Background build worker skipped.');
    return;
  }

  logger.info('Starting background build worker...');
  buildWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { sessionId, options } = job.data;
      const traceParent = options?.traceParent;

      logger.info(`Processing background build job for session ${sessionId}`, { sessionId, options });

      return traceAsync(`queue:compile:${options?.xmlId || 'full'}`, async (span) => {
        span.setAttribute('sessionId', sessionId);
        span.setAttribute('jobId', job.id || 'unknown');

        await ensureSessionHydrated(sessionId);

        const result = await buildExecutor.build(sessionId, {
          ...options,
          traceParent: traceParent || `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`
        });

        buildExecutor._finishLog(sessionId, result);

        logger.info(`Background build job completed for session ${sessionId}`, { sessionId, success: result.success });
        return result;
      }, traceParent);
    },
    { connection: connectionOptions, concurrency: 2 }
  );

  buildWorker.on('failed', (job, err) => {
    logger.error(`Background build job failed for job ${job?.id}`, err);
    if (job?.data?.sessionId) {
      const errResult = {
        success: false,
        error: err.message,
        stdout: '',
        stderr: err.message,
        sessionId: job.data.sessionId,
      };
      buildExecutor._finishLog(job.data.sessionId, errResult);
    }
  });
};
