import type { CanonicalRenderSpec, ExportResolution } from './render';

export type JobType = 'media-ingestion' | 'video-render';

export interface MediaIngestionJobData {
  assetId: string;
  userId: string;
  s3RawKey: string;
  originalFileName: string;
  mimeType: string;
}

export interface VideoRenderJobData {
  renderJobId: string;
  userId: string;
  projectId: string;
  renderSpec: CanonicalRenderSpec;
  resolution: ExportResolution;
  fps: 30 | 60;
  watermark: boolean;
}

export interface JobProgressUpdate {
  jobId: string;
  progressPercentage: number;
  currentStep: string;
  errorMessage?: string;
}
