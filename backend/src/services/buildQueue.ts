import { Queue, Worker, Job } from 'bullmq';
import { isRedisSharedStateEnabled, onRedisReconnect } from '../utils/redisClient.js';
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

export interface LocalQueueJob {
  id: string;
  sessionId: string;
  options: any;
  resolve: (val: any) => void;
  reject: (err: any) => void;
  createdAt: number;
}

const pendingMigratedResolvers = new Map<
  string,
  { resolve: (val: any) => void; reject: (err: any) => void }
>();

export const registerMigratedResolver = (
  key: string,
  resolve: (val: any) => void,
  reject: (err: any) => void
) => {
  pendingMigratedResolvers.set(key, { resolve, reject });
};

export const resolveMigratedJob = (key: string, result: any) => {
  const resolver = pendingMigratedResolvers.get(key);
  if (resolver) {
    pendingMigratedResolvers.delete(key);
    resolver.resolve(result);
  }
};

export const rejectMigratedJob = (key: string, err: any) => {
  const resolver = pendingMigratedResolvers.get(key);
  if (resolver) {
    pendingMigratedResolvers.delete(key);
    resolver.reject(err);
  }
};

// ── In-Process Local Fallback Queue ──
export class InProcessBuildQueue {
  private queue: LocalQueueJob[] = [];
  private running = false;

  get pendingCount(): number {
    return this.queue.length;
  }

  get isRunning(): boolean {
    return this.running;
  }

  getPendingJobs(): LocalQueueJob[] {
    return [...this.queue];
  }

  async add(sessionId: string, options: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.queue.push({ id, sessionId, options, resolve, reject, createdAt: Date.now() });
      void this.processNext();
    });
  }

  public async migrateToRedisQueue(targetQueue: Queue): Promise<number> {
    if (this.queue.length === 0) return 0;

    const jobsToMigrate = [...this.queue];
    this.queue = [];

    let migratedCount = 0;
    for (const job of jobsToMigrate) {
      try {
        const bullJob = await targetQueue.add(
          'compile',
          { sessionId: job.sessionId, options: job.options, migrationId: job.id },
          {
            removeOnComplete: true,
            removeOnFail: true,
          }
        );

        registerMigratedResolver(bullJob.id || job.id, job.resolve, job.reject);
        registerMigratedResolver(job.id, job.resolve, job.reject);
        migratedCount += 1;
        logger.info(`Migrated local fallback job ${job.id} to Redis BullMQ queue (Job ID: ${bullJob.id})`);
      } catch (err: any) {
        logger.error(`Failed to migrate local fallback job ${job.id} to Redis, restoring to local queue`, err);
        this.queue.push(job);
      }
    }

    return migratedCount;
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

export const localQueue = new InProcessBuildQueue();

export const migrateLocalQueueToRedis = async (): Promise<number> => {
  if (isRedisSharedStateEnabled() && buildQueue && localQueue.pendingCount > 0) {
    logger.info(`Migrating ${localQueue.pendingCount} pending jobs from local fallback queue to Redis BullMQ queue...`);
    return await localQueue.migrateToRedisQueue(buildQueue);
  }
  return 0;
};

// Register heartbeat/reconnection listener to automatically migrate local fallback queue back to Redis
if (isRedisSharedStateEnabled()) {
  onRedisReconnect(() => {
    logger.info('[BuildQueue] Redis reconnection detected. Initiating task migration from fallback queue to BullMQ...');
    migrateLocalQueueToRedis().catch((err) => {
      logger.error('[BuildQueue] Task migration to Redis failed after reconnection:', err);
    });
  });
}

const ensureSessionHydrated = async (sessionId: string) => {
  if (!buildExecutor.hasSession(sessionId)) {
    const dbSession = await workspaceRepository.getSession(sessionId);
    if (dbSession) {
      buildExecutor.setSession(sessionId, {
        id: dbSession.id,
        owner: dbSession.owner,
        repo: dbSession.repo,
        branch: dbSession.branch,
        repoPath: dbSession.repoPath,
        outputPath: dbSession.outputPath,
        previewPath: dbSession.previewPath,
        creatorLogin: dbSession.creatorLogin,
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
    try {
      logger.info(`Pushing build job to Redis queue for session ${sessionId}`, { sessionId, options });
      await buildQueue.add('compile', { sessionId, options }, {
        removeOnComplete: true,
        removeOnFail: true,
      });
      return true;
    } catch (redisErr: any) {
      logger.warn(`Redis queue add failed for session ${sessionId} (${redisErr.message}). Falling back to local in-process queue.`);
      localQueue.add(sessionId, options).catch((err) => {
        logger.error(`Local in-process queue job failed for session ${sessionId}`, err);
      });
      return true;
    }
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

  buildWorker.on('completed', (job: Job, result: any) => {
    const migrationId = job?.data?.options?.migrationId || job?.id;
    if (migrationId) {
      resolveMigratedJob(migrationId, result);
    }
  });

  buildWorker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Background build job failed for job ${job?.id}`, err);
    const migrationId = job?.data?.options?.migrationId || job?.id;
    if (migrationId) {
      rejectMigratedJob(migrationId, err);
    }
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
