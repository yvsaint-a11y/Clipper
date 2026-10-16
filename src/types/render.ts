export type ExportResolution = '720p' | '1080p'; // V1 strictly bounds exports to max 1080p

export type RenderStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RenderSettings {
  resolution: ExportResolution;
  fps: 30 | 60;
  watermark: boolean;
  crf?: number; // e.g. 18 for high-quality archival
  bitrateKbps?: number;
}

export interface CanonicalRenderSpec {
  projectId: string;
  projectVersion: number;
  timelineHash: string;
  sourceAssetSignatures: Array<{
    assetId: string;
    updatedAt: string;
  }>;
  renderSettings: RenderSettings;
  templateVersionId?: string | null;
}

export interface RenderJob {
  id: string;
  projectId: string;
  userId: string;
  idempotencyHash: string; // SHA-256 derived from CanonicalRenderSpec
  status: RenderStatus;
  progressPercentage: number; // 0 to 100
  currentStep: string;
  resolution: ExportResolution;
  fps: number;
  renderDurationMs?: number | null;
  fileSizeBytes?: number | null;
  s3ExportKey?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}
