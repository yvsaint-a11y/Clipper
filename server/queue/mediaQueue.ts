import { Queue, Job, type ConnectionOptions } from 'bullmq';
import { getRedisConnection, isRedisConfigured } from './redis';

export const MEDIA_QUEUE_NAME = 'media-processing';

export type MediaOperation = 'probe' | 'proxy' | 'thumbnail' | 'waveform';

export const VALID_MEDIA_OPERATIONS: readonly MediaOperation[] = [
  'probe',
  'proxy',
  'thumbnail',
  'waveform',
] as const;

export function isValidMediaOperation(op: unknown): op is MediaOperation {
  return typeof op === 'string' && VALID_MEDIA_OPERATIONS.includes(op as MediaOperation);
}

export interface MediaJobData {
  assetId: string;
  userId: string;
  operation: MediaOperation;
  enqueuedAt: string;
}

export interface MediaJobResult {
  assetId: string;
  userId: string;
  operation: MediaOperation;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  completedAt: string;
}

export interface MediaJobSummary {
  id: string;
  assetId: string;
  operation: MediaOperation;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  attemptsMade: number;
  failedReason?: string;
  timestamp: number;
  finishedOn?: number;
  returnvalue?: MediaJobResult;
}

/**
 * Generates a deterministic BullMQ job ID.
 * Prevents duplicate in-flight processing for the same asset and operation.
 * Format: media:{assetId}:{operation}
 */
export function buildMediaJobId(assetId: string, operation: MediaOperation): string {
  return `media:${assetId}:${operation}`;
}

let mediaQueueInstance: Queue<MediaJobData, MediaJobResult> | null = null;

export const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
  },
  removeOnFail: {
    count: 5000,
  },
};

/**
 * Returns or initializes the BullMQ Media Processing Queue.
 */
export function getMediaQueue(customConnection?: ConnectionOptions): Queue<MediaJobData, MediaJobResult> {
  if (customConnection) {
    return new Queue<MediaJobData, MediaJobResult>(MEDIA_QUEUE_NAME, {
      connection: customConnection,
      defaultJobOptions: DEFAULT_RETRY_CONFIG,
    });
  }

  if (!mediaQueueInstance) {
    const connection = getRedisConnection();
    mediaQueueInstance = new Queue<MediaJobData, MediaJobResult>(MEDIA_QUEUE_NAME, {
      connection: connection as unknown as ConnectionOptions,
      defaultJobOptions: DEFAULT_RETRY_CONFIG,
    });
  }

  return mediaQueueInstance;
}

/**
 * Enqueues a media processing job with a deterministic job ID and exponential backoff retry configuration.
 */
export async function enqueueMediaJob(params: {
  assetId: string;
  userId: string;
  operation: MediaOperation;
}): Promise<Job<MediaJobData, MediaJobResult>> {
  if (!isValidMediaOperation(params.operation)) {
    throw new Error(`Invalid media operation: "${params.operation}". Allowed: ${VALID_MEDIA_OPERATIONS.join(', ')}`);
  }

  const queue = getMediaQueue();
  const jobId = buildMediaJobId(params.assetId, params.operation);

  // If a job with this ID already exists and is waiting/active, BullMQ reuses it.
  // If it previously completed or failed, we remove or overwrite it so users can retry/reprocess.
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'completed' || state === 'failed') {
      try {
        await existingJob.remove();
      } catch {
        // Ignore if already removed
      }
    }
  }

  const job = await queue.add(
    params.operation,
    {
      assetId: params.assetId,
      userId: params.userId,
      operation: params.operation,
      enqueuedAt: new Date().toISOString(),
    },
    {
      jobId,
      ...DEFAULT_RETRY_CONFIG,
    },
  );

  return job;
}

/**
 * Retrieves a media job summary by ID while enforcing authenticated user ownership.
 * Returns null if the job does not exist or if the job's userId does not match the requester.
 */
export async function getMediaJobSummary(
  jobId: string,
  authenticatedUserId: string,
): Promise<MediaJobSummary | null> {
  const queue = getMediaQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  // Security: IDOR protection on job data
  if (job.data.userId !== authenticatedUserId) {
    return null;
  }

  const state = await job.getState();

  return {
    id: job.id as string,
    assetId: job.data.assetId,
    operation: job.data.operation,
    state: (state as MediaJobSummary['state']) || 'unknown',
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
    returnvalue: job.returnvalue,
  };
}

/**
 * Closes the media queue connection.
 */
export async function closeMediaQueue(): Promise<void> {
  if (mediaQueueInstance) {
    try {
      await mediaQueueInstance.close();
    } finally {
      mediaQueueInstance = null;
    }
  }
}
