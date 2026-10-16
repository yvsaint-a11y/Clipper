import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    config.r2.accessKeyId &&
    config.r2.secretAccessKey &&
    config.r2.accountId
  );
}

/**
 * Returns the S3Client configured for Cloudflare R2.
 * Uses lazy initialization so missing R2 credentials don't crash startup.
 */
export function getR2Client(): S3Client | null {
  if (s3ClientInstance) {
    return s3ClientInstance;
  }

  if (!isR2Configured()) {
    return null;
  }

  const endpoint = `https://${config.r2.accountId}.r2.cloudflarestorage.com`;

  s3ClientInstance = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
    // R2 requires path-style addressing off or auto; standard S3 config
    forcePathStyle: true,
  });

  return s3ClientInstance;
}

/**
 * Sanitizes original filename to prevent path traversal, control chars, and weird delimiters.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'media';
  // Replace characters other than alphanumeric, hyphens, underscores, dots with underscore
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

/**
 * Builds the canonical user-scoped storage key.
 * Format: raw/{userId}/{assetId}.{extension}
 * 
 * Never allows client to specify or control directory structure.
 */
export function buildUserScopedStorageKey(userId: string, assetId: string, extension: string): string {
  const cleanExt = extension.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `raw/${userId}/${assetId}.${cleanExt}`;
}

/**
 * Builds the canonical user-scoped proxy storage key.
 * Format: proxies/{userId}/{assetId}_720p.mp4
 * 
 * Deterministic and securely isolated inside the user's private namespace.
 */
export function buildUserScopedProxyKey(userId: string, assetId: string): string {
  return `proxies/${userId}/${assetId}_720p.mp4`;
}

/**
 * Builds the canonical user-scoped thumbnail storage key.
 * Format: thumbnails/{userId}/{assetId}.jpg
 */
export function buildUserScopedThumbnailKey(userId: string, assetId: string): string {
  return `thumbnails/${userId}/${assetId}.jpg`;
}

/**
 * Builds the canonical user-scoped waveform storage key.
 * Format: waveforms/{userId}/{assetId}.json
 */
export function buildUserScopedWaveformKey(userId: string, assetId: string): string {
  return `waveforms/${userId}/${assetId}.json`;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  httpMethod: 'PUT';
  headers: Record<string, string>;
}

/**
 * Generates a short-lived presigned PUT URL for direct browser-to-R2 upload.
 */
export async function generatePresignedUploadUrl(params: {
  storageKey: string;
  contentType: string;
  fileSizeBytes?: number;
  expiresInSeconds?: number;
}): Promise<PresignedUploadResult> {
  const { storageKey, contentType, expiresInSeconds = 900 } = params; // 15 min default
  const client = getR2Client();

  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const bucket = config.r2.bucketName;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    uploadUrl,
    storageKey,
    expiresInSeconds,
    httpMethod: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
  };
}

/**
 * Generates a short-lived presigned GET URL for secure media retrieval.
 */
export async function generatePresignedDownloadUrl(params: {
  storageKey: string;
  expiresInSeconds?: number;
  downloadFilename?: string;
}): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
  const { storageKey, expiresInSeconds = 3600, downloadFilename } = params; // 1 hour default
  const client = getR2Client();

  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const bucket = config.r2.bucketName;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ResponseContentDisposition: downloadFilename
      ? `inline; filename="${encodeURIComponent(downloadFilename)}"`
      : undefined,
  });

  const downloadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    downloadUrl,
    expiresInSeconds,
  };
}

/**
 * Verifies whether the object exists in R2 bucket using HeadObject.
 */
export async function verifyR2ObjectExists(storageKey: string): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
  const client = getR2Client();
  if (!client) {
    // If R2 credentials are not configured, return fallback
    return { exists: false };
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: config.r2.bucketName,
      Key: storageKey,
    });

    const response = await client.send(command);
    return {
      exists: true,
      sizeBytes: response.ContentLength,
      contentType: response.ContentType,
    };
  } catch (err: unknown) {
    const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    console.error(`[R2] HeadObject error for ${storageKey}:`, err);
    return { exists: false };
  }
}

/**
 * Safely downloads an object from private R2 storage directly to a local file path.
 * Supports both byteArray transforms and stream piping without exposing credentials.
 */
export async function downloadR2ObjectToFile(storageKey: string, destPath: string): Promise<void> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const command = new GetObjectCommand({
    Bucket: config.r2.bucketName,
    Key: storageKey,
  });

  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object at "${storageKey}" returned empty body.`);
  }

  const body = response.Body as any;
  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    await fs.promises.writeFile(destPath, Buffer.from(bytes));
  } else if (typeof body.pipe === 'function' || body instanceof Readable) {
    const writeStream = fs.createWriteStream(destPath);
    await pipeline(body, writeStream);
  } else {
    throw new Error('Unsupported response body format from R2 storage.');
  }
}

/**
 * Safely uploads a local file to private Cloudflare R2 object storage.
 */
export async function uploadLocalFileToR2(
  localFilePath: string,
  storageKey: string,
  contentType: string = 'video/mp4',
): Promise<void> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const fileStream = fs.createReadStream(localFilePath);
  const fileStats = await fs.promises.stat(localFilePath);

  const command = new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: storageKey,
    Body: fileStream,
    ContentType: contentType,
    ContentLength: fileStats.size,
  });

  await client.send(command);
}

/**
 * Safely uploads an in-memory Buffer (e.g. waveform JSON) to private Cloudflare R2 object storage.
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  storageKey: string,
  contentType: string = 'application/json',
): Promise<void> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const command = new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: storageKey,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
  });

  await client.send(command);
}

/**
 * Downloads an object from R2 directly to an in-memory Buffer.
 */
export async function downloadR2ObjectToBuffer(storageKey: string): Promise<Buffer> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 storage is not configured on the server.');
  }

  const command = new GetObjectCommand({
    Bucket: config.r2.bucketName,
    Key: storageKey,
  });

  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object at "${storageKey}" returned empty body.`);
  }

  const body = response.Body as any;
  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
