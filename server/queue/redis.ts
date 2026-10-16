import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../config/env';

export class RedisConfigError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 503) {
    super(message);
    this.name = 'RedisConfigError';
    this.statusCode = statusCode;
  }
}

let sharedRedisClient: Redis | null = null;

/**
 * Safely masks passwords and user credentials in a Redis URL for logging.
 * Never logs plaintext credentials.
 */
export function maskRedisUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '[not-configured]';
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    if (parsed.username && parsed.username !== 'default') {
      parsed.username = '***';
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, regex fallback to scrub :password@
    return rawUrl.replace(/:\/\/[^@]*@/, '://***@');
  }
}

/**
 * Validates whether Redis connection string is present and has a valid scheme.
 */
export function isRedisConfigured(): boolean {
  const url = process.env.REDIS_URL || config.redis.url;
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }
  return url.startsWith('redis://') || url.startsWith('rediss://');
}

/**
 * Returns the masked Redis URL safe for diagnostics and logging.
 */
export function getMaskedRedisUrl(): string {
  const url = process.env.REDIS_URL || config.redis.url;
  return maskRedisUrl(url);
}

/**
 * Builds BullMQ-compliant RedisOptions:
 * - maxRetriesPerRequest: null (required by BullMQ)
 * - enableReadyCheck: false (required by BullMQ)
 * - lazyConnect: true
 */
export function getBullMQRedisOptions(customUrl?: string): RedisOptions {
  const url = customUrl !== undefined ? customUrl : (process.env.REDIS_URL || config.redis.url);

  if (!url || typeof url !== 'string' || (!url.startsWith('redis://') && !url.startsWith('rediss://'))) {
    throw new RedisConfigError(
      'Redis URL is invalid or not configured. Expected a redis:// or rediss:// connection string.',
    );
  }

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

/**
 * Creates a new dedicated Redis connection for BullMQ Queue or Worker.
 */
export function createRedisClient(customUrl?: string): Redis {
  const url = customUrl || process.env.REDIS_URL || config.redis.url;
  const options = getBullMQRedisOptions(url);
  return new Redis(url, options);
}

/**
 * Returns or initializes the shared Redis client singleton.
 */
export function getRedisConnection(): Redis {
  if (!sharedRedisClient) {
    sharedRedisClient = createRedisClient();
  }
  return sharedRedisClient;
}

/**
 * Gracefully closes the shared Redis connection.
 */
export async function closeRedisConnection(): Promise<void> {
  if (sharedRedisClient) {
    try {
      await sharedRedisClient.quit();
    } catch {
      sharedRedisClient.disconnect();
    } finally {
      sharedRedisClient = null;
    }
  }
}
