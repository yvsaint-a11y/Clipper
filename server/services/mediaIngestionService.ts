import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { mediaAssets } from '../db/schema/media';

/**
 * Valid media ingestion statuses supported by Clipper.
 * 'pending': Pre-signed upload URL allocated, waiting for client binary upload.
 * 'processing': Upload complete, undergoing metadata extraction or future transcoding.
 * 'ready': Media asset verified, metadata persisted, ready for timeline use.
 * 'failed': Ingestion failed due to network, storage, or codec/container corruption.
 */
export const INGESTION_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export class MediaIngestionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MediaIngestionError';
    this.statusCode = statusCode;
  }
}

export interface IngestionMetadataInput {
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  hasAudio?: boolean | null;
  waveformUrl?: string | null;
  thumbnailUrl?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface MediaIngestionRecord {
  id: string;
  userId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  ingestionStatus: IngestionStatus;
  waveformUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validates that an ingestion status string is one of the supported states.
 */
export function isValidIngestionStatus(status: unknown): status is IngestionStatus {
  return typeof status === 'string' && (INGESTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Retrieves the current ingestion status and persisted metadata for an owned media asset.
 * Enforces strict multi-tenant ownership check to prevent IDOR vulnerabilities.
 */
export async function getMediaIngestionStatus(
  assetId: string,
  userId: string,
): Promise<MediaIngestionRecord> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaIngestionError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaIngestionError('Database service is currently unavailable.', 503);
  }

  // Strict ownership enforcement (assetId + userId)
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!asset) {
    throw new MediaIngestionError('Media asset not found or access denied.', 404);
  }

  return formatIngestionRecord(asset);
}

/**
 * Updates metadata for an owned media asset.
 * Only modifies schema-supported columns (durationMs, width, height, fps, hasAudio, etc.).
 */
export async function updateMediaIngestionMetadata(
  assetId: string,
  userId: string,
  input: IngestionMetadataInput,
  newStatus?: IngestionStatus,
): Promise<MediaIngestionRecord> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaIngestionError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaIngestionError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaIngestionError('Media asset not found or access denied.', 404);
  }

  // 2. Validate metadata fields
  const updates: Partial<typeof mediaAssets.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.durationMs !== undefined) {
    if (input.durationMs !== null && (typeof input.durationMs !== 'number' || input.durationMs < 0 || !Number.isFinite(input.durationMs))) {
      throw new MediaIngestionError('durationMs must be a non-negative finite number or null.', 400);
    }
    updates.durationMs = input.durationMs !== null ? Math.round(input.durationMs) : null;
  }

  if (input.width !== undefined) {
    if (input.width !== null && (typeof input.width !== 'number' || input.width <= 0 || !Number.isInteger(input.width))) {
      throw new MediaIngestionError('width must be a positive integer or null.', 400);
    }
    updates.width = input.width;
  }

  if (input.height !== undefined) {
    if (input.height !== null && (typeof input.height !== 'number' || input.height <= 0 || !Number.isInteger(input.height))) {
      throw new MediaIngestionError('height must be a positive integer or null.', 400);
    }
    updates.height = input.height;
  }

  if (input.fps !== undefined) {
    if (input.fps !== null) {
      const numFps = Number(input.fps);
      if (isNaN(numFps) || numFps <= 0 || !Number.isFinite(numFps)) {
        throw new MediaIngestionError('fps must be a positive number or null.', 400);
      }
      updates.fps = numFps.toFixed(2);
    } else {
      updates.fps = null;
    }
  }

  if (input.hasAudio !== undefined && input.hasAudio !== null) {
    updates.hasAudio = Boolean(input.hasAudio);
  }

  if (input.mimeType) {
    if (typeof input.mimeType !== 'string' || input.mimeType.length > 128) {
      throw new MediaIngestionError('Invalid MIME type provided.', 400);
    }
    updates.mimeType = input.mimeType.trim();
  }

  if (input.fileSizeBytes !== undefined && input.fileSizeBytes !== null) {
    const size = Number(input.fileSizeBytes);
    if (isNaN(size) || size < 0 || !Number.isFinite(size)) {
      throw new MediaIngestionError('fileSizeBytes must be a non-negative number.', 400);
    }
    updates.fileSizeBytes = size;
  }

  if (input.waveformUrl !== undefined) {
    updates.waveformUrl = input.waveformUrl;
  }

  if (input.thumbnailUrl !== undefined) {
    updates.thumbnailUrl = input.thumbnailUrl;
  }

  if (newStatus !== undefined) {
    if (!isValidIngestionStatus(newStatus)) {
      throw new MediaIngestionError(`Invalid ingestion status "${newStatus}". Must be one of: ${INGESTION_STATUSES.join(', ')}`, 400);
    }
    updates.ingestionStatus = newStatus;
  }

  // Preserve existing metadata jsonb and merge new extra attributes
  if (input.extra && typeof input.extra === 'object' && !Array.isArray(input.extra)) {
    const existingMeta = (existingAsset.metadata as Record<string, unknown>) || {};
    updates.metadata = {
      ...existingMeta,
      ...input.extra,
      lastMetadataUpdated: new Date().toISOString(),
    };
  }

  // 3. Persist to Postgres
  const [updated] = await db
    .update(mediaAssets)
    .set(updates)
    .where(eq(mediaAssets.id, assetId))
    .returning();

  return formatIngestionRecord(updated);
}

/**
 * Updates an asset's ingestion status (e.g. from 'pending' -> 'processing' -> 'ready' or 'failed').
 * If status is 'failed', an error message is safely recorded into the metadata jsonb column.
 */
export async function updateMediaIngestionStatus(
  assetId: string,
  userId: string,
  status: IngestionStatus,
  errorMessage?: string,
): Promise<MediaIngestionRecord> {
  if (!isValidIngestionStatus(status)) {
    throw new MediaIngestionError(`Invalid ingestion status "${status}". Must be one of: ${INGESTION_STATUSES.join(', ')}`, 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaIngestionError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaIngestionError('Media asset not found or access denied.', 404);
  }

  const updates: Partial<typeof mediaAssets.$inferInsert> = {
    ingestionStatus: status,
    updatedAt: new Date(),
  };

  if (status === 'failed' && errorMessage) {
    const existingMeta = (existingAsset.metadata as Record<string, unknown>) || {};
    updates.metadata = {
      ...existingMeta,
      lastError: errorMessage,
      failedAt: new Date().toISOString(),
    };
  }

  const [updated] = await db
    .update(mediaAssets)
    .set(updates)
    .where(eq(mediaAssets.id, assetId))
    .returning();

  return formatIngestionRecord(updated);
}

/**
 * Helper to normalize and format a raw database mediaAssets row into a typed MediaIngestionRecord.
 */
function formatIngestionRecord(asset: typeof mediaAssets.$inferSelect): MediaIngestionRecord {
  return {
    id: asset.id,
    userId: asset.userId,
    storageKey: asset.storageKey,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    fileSizeBytes: Number(asset.fileSizeBytes),
    durationMs: asset.durationMs !== null ? Number(asset.durationMs) : null,
    width: asset.width !== null ? Number(asset.width) : null,
    height: asset.height !== null ? Number(asset.height) : null,
    fps: asset.fps !== null ? Number(asset.fps) : null,
    hasAudio: Boolean(asset.hasAudio),
    ingestionStatus: asset.ingestionStatus as IngestionStatus,
    waveformUrl: asset.waveformUrl,
    thumbnailUrl: asset.thumbnailUrl,
    metadata: (asset.metadata as Record<string, unknown>) || {},
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}
