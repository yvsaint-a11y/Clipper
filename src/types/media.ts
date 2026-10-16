export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type MediaType = 'video' | 'audio' | 'image';

export interface WaveformData {
  sampleRate: number;
  samplesPerPixel: number;
  length: number;
  peaks: number[]; // Normalized amplitude peaks (0.0 to 1.0)
}

export interface MediaAsset {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  mediaType: MediaType;
  fileSizeBytes: number;
  s3RawKey: string;
  s3ProxyKey?: string | null;
  s3ThumbnailKey?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  waveformData?: WaveformData | null;
  status: MediaStatus;
  createdAt: string;
}
