import { Queue, Job, type ConnectionOptions } from 'bullmq';
import { getRedisConnection, isRedisConfigured } from './redis';
import type { VideoRenderJobData } from '../../src/types/queue';

export const RENDER_QUEUE_NAME = 'video-render';

let renderQueueInstance: Queue<VideoRenderJobData> | null = null;

export const DEFAULT_RENDER_RETRY_CONFIG = {
  attempts: 2,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: {
    count: 500,
  },
  removeOnFail: {
    count: 2000,
  },
};

/**
 * Returns or initializes the BullMQ Video Render Queue.
 * Only connects if Redis is configured.
 */
export function getRenderQueue(customConnection?: ConnectionOptions): Queue<VideoRenderJobData> | null {
  if (!isRedisConfigured() && !customConnection) {
    return null;
  }

  if (customConnection) {
    return new Queue<VideoRenderJobData>(RENDER_QUEUE_NAME, {
      connection: customConnection,
      defaultJobOptions: DEFAULT_RENDER_RETRY_CONFIG,
    });
  }

  if (!renderQueueInstance) {
    const connection = getRedisConnection();
    renderQueueInstance = new Queue<VideoRenderJobData>(RENDER_QUEUE_NAME, {
      connection: connection as unknown as ConnectionOptions,
      defaultJobOptions: DEFAULT_RENDER_RETRY_CONFIG,
    });
  }

  return renderQueueInstance;
}

/**
 * Enqueues a video render job to the BullMQ queue when Redis is available.
 * Returns null if Redis is not configured in the environment.
 */
export async function enqueueRenderJob(data: VideoRenderJobData): Promise<Job<VideoRenderJobData> | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  const queue = getRenderQueue();
  if (!queue) {
    return null;
  }

  const jobId = `render_${data.renderJobId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const job = await queue.add(
    'render',
    data,
    {
      jobId,
      ...DEFAULT_RENDER_RETRY_CONFIG,
    },
  );

  return job;
}

/**
 * Closes the render queue connection safely.
 */
export async function closeRenderQueue(): Promise<void> {
  if (renderQueueInstance) {
    try {
      await renderQueueInstance.close();
    } finally {
      renderQueueInstance = null;
    }
  }
}
