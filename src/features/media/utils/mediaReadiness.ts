import {
  useMediaProcessingStore,
  type MediaJobState,
  type MediaOperation,
  type MediaProcessingStatus,
} from '../stores/useMediaProcessingStore';

export type MediaReadinessStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type DerivativeType = 'original' | 'probe' | 'proxy' | 'thumbnail' | 'waveform';
export type MediaKind = 'video' | 'audio' | 'image' | 'unknown';

export interface MediaAssetLike {
  id: string;
  storageKey?: string | null;
  originalFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  ingestionStatus?: string;
  hasAudio?: boolean | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  thumbnailUrl?: string | null;
  waveformUrl?: string | null;
  previewUrl?: string | null;
  proxyPreviewUrl?: string | null;
  originalPreviewUrl?: string | null;
  thumbnailSignedUrl?: string | null;
  waveformData?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export interface DerivativeReadiness {
  status: MediaReadinessStatus;
  error: string | null;
  required: boolean;
}

export interface MediaReadinessReport {
  assetId: string;
  kind: MediaKind;
  status: MediaReadinessStatus;
  isFullyReady: boolean;
  isAssetUsable: boolean;
  isPreviewReady: boolean;
  preferredPreviewSource: 'proxy' | 'original' | 'none';
  hasFailedDerivatives: boolean;
  failedDerivatives: DerivativeType[];
  processingDerivatives: DerivativeType[];
  pendingDerivatives: DerivativeType[];
  derivatives: {
    original: DerivativeReadiness;
    probe: DerivativeReadiness;
    proxy: DerivativeReadiness;
    thumbnail: DerivativeReadiness;
    waveform: DerivativeReadiness;
  };
}

export type JobsOverrideMap = Record<string, Partial<MediaJobState> | MediaProcessingStatus | MediaReadinessStatus | undefined>;

function normalizeStatusString(raw?: string | null): MediaReadinessStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === 'ready' || s === 'completed' || s === 'uploaded') return 'ready';
  if (s === 'processing' || s === 'active' || s === 'queued' || s === 'waiting' || s === 'delayed') {
    return 'processing';
  }
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'pending') return 'pending';
  return null;
}

function getLiveJobEntry(
  assetId: string,
  op: MediaOperation,
  jobsOverride?: JobsOverrideMap,
): Partial<MediaJobState> | null {
  const source = jobsOverride ?? useMediaProcessingStore.getState().jobs;
  if (!source) return null;

  const raw = source[`${assetId}:${op}`] ?? source[op];
  if (!raw) return null;

  if (typeof raw === 'string') {
    return {
      assetId,
      operation: op,
      status: raw === 'pending' ? 'idle' : (raw as MediaProcessingStatus),
    };
  }

  return raw;
}

export function getMediaKind(asset?: MediaAssetLike | null): MediaKind {
  if (!asset) return 'unknown';
  const mime = (asset.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';

  const meta = (asset.metadata as Record<string, any>) || {};
  if (meta.videoCodec) return 'video';
  if (meta.audioCodec && !meta.videoCodec) return 'audio';
  return 'unknown';
}

function resolveOriginalReadiness(asset: MediaAssetLike, meta: Record<string, any>): DerivativeReadiness {
  const ingestion = (asset.ingestionStatus || '').toLowerCase();

  if (ingestion === 'pending') {
    return { status: 'pending', error: null, required: true };
  }

  if (ingestion === 'uploading') {
    return { status: 'processing', error: null, required: true };
  }

  // Check if probe or valid dimensions/duration confirm the original file is intact
  const hasValidProbe =
    meta.probe?.status === 'ready' ||
    Boolean(meta.probedAt) ||
    Boolean(meta.videoCodec) ||
    Boolean(meta.audioCodec) ||
    Boolean(asset.durationMs && asset.durationMs > 0);

  if (ingestion === 'failed') {
    // Derivative failure (e.g., proxy/thumbnail/waveform) must NOT invalidate the original asset
    const hasDerivativeFailure =
      meta.proxy?.status === 'failed' ||
      meta.thumbnail?.status === 'failed' ||
      meta.waveform?.status === 'failed';

    if (hasValidProbe || (Boolean(asset.storageKey) && hasDerivativeFailure)) {
      return { status: 'ready', error: null, required: true };
    }

    return {
      status: 'failed',
      error: (meta.lastIngestionError as string) || 'Media upload or validation failed.',
      required: true,
    };
  }

  if (
    ingestion === 'ready' ||
    ingestion === 'uploaded' ||
    ingestion === 'processing' ||
    Boolean(asset.storageKey)
  ) {
    return { status: 'ready', error: null, required: true };
  }

  return { status: 'pending', error: null, required: true };
}

function resolveProbeReadiness(
  asset: MediaAssetLike,
  kind: MediaKind,
  original: DerivativeReadiness,
  meta: Record<string, any>,
  jobsOverride?: JobsOverrideMap,
): DerivativeReadiness {
  if (kind === 'image') {
    return {
      status: original.status,
      error: original.error,
      required: false,
    };
  }

  const liveJob = getLiveJobEntry(asset.id, 'probe', jobsOverride);
  if (liveJob && liveJob.status && liveJob.status !== 'idle') {
    const mapped = normalizeStatusString(liveJob.status);
    if (mapped) {
      return {
        status: mapped,
        error: liveJob.error || null,
        required: true,
      };
    }
  }

  if (meta.probe) {
    if (typeof meta.probe === 'string') {
      const mapped = normalizeStatusString(meta.probe);
      if (mapped) return { status: mapped, error: null, required: true };
    } else if (typeof meta.probe === 'object') {
      const mapped = normalizeStatusString(meta.probe.status);
      if (mapped) {
        return {
          status: mapped,
          error: (meta.probe.error as string) || null,
          required: true,
        };
      }
      if (meta.probe.videoCodec || meta.probe.audioCodec || meta.probe.durationMs || meta.probe.format) {
        return { status: 'ready', error: null, required: true };
      }
    }
  }

  if (Boolean(meta.probedAt) || Boolean(meta.videoCodec) || Boolean(meta.audioCodec)) {
    return { status: 'ready', error: null, required: true };
  }

  const ingestion = (asset.ingestionStatus || '').toLowerCase();
  if (ingestion === 'processing') {
    return { status: 'processing', error: null, required: true };
  }

  if (ingestion === 'failed') {
    return {
      status: 'failed',
      error: (meta.lastIngestionError as string) || 'Media probe failed.',
      required: true,
    };
  }

  if (ingestion === 'pending') {
    return { status: 'pending', error: null, required: true };
  }

  if (
    Boolean(asset.durationMs && asset.durationMs > 0) &&
    (kind === 'audio' || Boolean(asset.width && asset.height))
  ) {
    return { status: 'ready', error: null, required: true };
  }

  return { status: 'pending', error: null, required: true };
}

function resolveProxyReadiness(
  asset: MediaAssetLike,
  kind: MediaKind,
  meta: Record<string, any>,
  jobsOverride?: JobsOverrideMap,
): DerivativeReadiness {
  if (kind !== 'video') {
    return { status: 'pending', error: null, required: false };
  }

  const liveJob = getLiveJobEntry(asset.id, 'proxy', jobsOverride);
  if (liveJob && liveJob.status && liveJob.status !== 'idle') {
    const mapped = normalizeStatusString(liveJob.status);
    if (mapped) {
      return {
        status: mapped,
        error: liveJob.error || null,
        required: true,
      };
    }
  }

  if (meta.proxy) {
    if (typeof meta.proxy === 'string') {
      const mapped = normalizeStatusString(meta.proxy);
      if (mapped) return { status: mapped, error: null, required: true };
    } else if (typeof meta.proxy === 'object') {
      const mapped = normalizeStatusString(meta.proxy.status);
      if (mapped) {
        return {
          status: mapped,
          error: (meta.proxy.error as string) || null,
          required: true,
        };
      }
      if (meta.proxy.storageKey) {
        return { status: 'ready', error: null, required: true };
      }
    }
  }

  if (Boolean(meta.proxyStorageKey) || Boolean(asset.proxyPreviewUrl)) {
    return { status: 'ready', error: null, required: true };
  }

  return { status: 'pending', error: null, required: true };
}

function resolveThumbnailReadiness(
  asset: MediaAssetLike,
  kind: MediaKind,
  meta: Record<string, any>,
  jobsOverride?: JobsOverrideMap,
): DerivativeReadiness {
  if (kind !== 'video') {
    return { status: 'pending', error: null, required: false };
  }

  const liveJob = getLiveJobEntry(asset.id, 'thumbnail', jobsOverride);
  if (liveJob && liveJob.status && liveJob.status !== 'idle') {
    const mapped = normalizeStatusString(liveJob.status);
    if (mapped) {
      return {
        status: mapped,
        error: liveJob.error || null,
        required: true,
      };
    }
  }

  if (meta.thumbnail) {
    if (typeof meta.thumbnail === 'string') {
      const mapped = normalizeStatusString(meta.thumbnail);
      if (mapped) return { status: mapped, error: null, required: true };
    } else if (typeof meta.thumbnail === 'object') {
      const mapped = normalizeStatusString(meta.thumbnail.status);
      if (mapped) {
        return {
          status: mapped,
          error: (meta.thumbnail.error as string) || null,
          required: true,
        };
      }
      if (meta.thumbnail.storageKey) {
        return { status: 'ready', error: null, required: true };
      }
    }
  }

  if (
    Boolean(meta.thumbnailStorageKey) ||
    Boolean(asset.thumbnailUrl) ||
    Boolean(asset.thumbnailSignedUrl)
  ) {
    return { status: 'ready', error: null, required: true };
  }

  return { status: 'pending', error: null, required: true };
}

function resolveWaveformReadiness(
  asset: MediaAssetLike,
  kind: MediaKind,
  meta: Record<string, any>,
  jobsOverride?: JobsOverrideMap,
): DerivativeReadiness {
  if (kind !== 'audio') {
    return { status: 'pending', error: null, required: false };
  }

  const liveJob = getLiveJobEntry(asset.id, 'waveform', jobsOverride);
  if (liveJob && liveJob.status && liveJob.status !== 'idle') {
    const mapped = normalizeStatusString(liveJob.status);
    if (mapped) {
      return {
        status: mapped,
        error: liveJob.error || null,
        required: true,
      };
    }
  }

  if (meta.waveform) {
    if (typeof meta.waveform === 'string') {
      const mapped = normalizeStatusString(meta.waveform);
      if (mapped) return { status: mapped, error: null, required: true };
    } else if (typeof meta.waveform === 'object') {
      const mapped = normalizeStatusString(meta.waveform.status);
      if (mapped) {
        return {
          status: mapped,
          error: (meta.waveform.error as string) || null,
          required: true,
        };
      }
      if (meta.waveform.storageKey || Array.isArray(meta.waveform.samples)) {
        return { status: 'ready', error: null, required: true };
      }
    }
  }

  if (
    Boolean(meta.waveformStorageKey) ||
    Boolean(asset.waveformUrl) ||
    Boolean(asset.waveformData)
  ) {
    return { status: 'ready', error: null, required: true };
  }

  return { status: 'pending', error: null, required: true };
}

/**
 * Checks whether a specific media derivative or stage ('original' | 'probe' | 'proxy' | 'thumbnail' | 'waveform')
 * is ready for use.
 */
export function isDerivativeReady(
  asset: MediaAssetLike | null | undefined,
  type: DerivativeType,
  jobsOverride?: JobsOverrideMap,
): boolean {
  if (!asset) return false;
  const readiness = getMediaReadiness(asset, jobsOverride);
  return readiness.derivatives[type]?.status === 'ready';
}

/**
 * Computes comprehensive readiness across original media, FFprobe metadata,
 * 720p editing proxy, video thumbnail, and audio waveform.
 */
export function getMediaReadiness(
  asset: MediaAssetLike | null | undefined,
  jobsOverride?: JobsOverrideMap,
): MediaReadinessReport {
  if (!asset) {
    const emptyDerivative: DerivativeReadiness = { status: 'pending', error: null, required: false };
    return {
      assetId: '',
      kind: 'unknown',
      status: 'pending',
      isFullyReady: false,
      isAssetUsable: false,
      isPreviewReady: false,
      preferredPreviewSource: 'none',
      hasFailedDerivatives: false,
      failedDerivatives: [],
      processingDerivatives: [],
      pendingDerivatives: [],
      derivatives: {
        original: emptyDerivative,
        probe: emptyDerivative,
        proxy: emptyDerivative,
        thumbnail: emptyDerivative,
        waveform: emptyDerivative,
      },
    };
  }

  const kind = getMediaKind(asset);
  const meta = (asset.metadata as Record<string, any>) || {};

  const original = resolveOriginalReadiness(asset, meta);
  const probe = resolveProbeReadiness(asset, kind, original, meta, jobsOverride);
  const proxy = resolveProxyReadiness(asset, kind, meta, jobsOverride);
  const thumbnail = resolveThumbnailReadiness(asset, kind, meta, jobsOverride);
  const waveform = resolveWaveformReadiness(asset, kind, meta, jobsOverride);

  const derivatives = {
    original,
    probe,
    proxy,
    thumbnail,
    waveform,
  };

  const requiredTypes: DerivativeType[] =
    kind === 'video'
      ? ['original', 'probe', 'proxy', 'thumbnail']
      : kind === 'audio'
      ? ['original', 'probe', 'waveform']
      : ['original'];

  const failedDerivatives: DerivativeType[] = [];
  const processingDerivatives: DerivativeType[] = [];
  const pendingDerivatives: DerivativeType[] = [];

  for (const type of requiredTypes) {
    const d = derivatives[type];
    if (d.status === 'failed') failedDerivatives.push(type);
    else if (d.status === 'processing') processingDerivatives.push(type);
    else if (d.status === 'pending') pendingDerivatives.push(type);
  }

  const hasFailedDerivatives = failedDerivatives.length > 0;
  const isFullyReady = requiredTypes.every((type) => derivatives[type].status === 'ready');

  // An asset remains usable as long as the original media is ready and probe hasn't failed.
  // Derivative failures (proxy, thumbnail, waveform) do NOT invalidate the underlying asset.
  const isAssetUsable =
    kind === 'image'
      ? original.status === 'ready'
      : original.status === 'ready' && probe.status !== 'failed' && probe.status !== 'pending';

  // Determine preferred preview source & preview readiness
  let preferredPreviewSource: 'proxy' | 'original' | 'none' = 'none';
  if (kind === 'video') {
    if (proxy.status === 'ready') {
      preferredPreviewSource = 'proxy';
    } else if (original.status === 'ready' && probe.status !== 'failed') {
      preferredPreviewSource = 'original';
    }
  } else if (original.status === 'ready' && probe.status !== 'failed') {
    preferredPreviewSource = 'original';
  }

  const isPreviewReady = preferredPreviewSource !== 'none';

  // Overall status across required pipeline stages
  let status: MediaReadinessStatus = 'pending';
  if (isFullyReady) {
    status = 'ready';
  } else if (hasFailedDerivatives) {
    status = 'failed';
  } else if (
    processingDerivatives.length > 0 ||
    (original.status === 'ready' && probe.status === 'ready' && pendingDerivatives.length > 0)
  ) {
    status = 'processing';
  } else {
    status = 'pending';
  }

  return {
    assetId: asset.id,
    kind,
    status,
    isFullyReady,
    isAssetUsable,
    isPreviewReady,
    preferredPreviewSource,
    hasFailedDerivatives,
    failedDerivatives,
    processingDerivatives,
    pendingDerivatives,
    derivatives,
  };
}

/**
 * Returns true if the media asset can be previewed in the editor viewport
 * (either via 720p proxy or via original media fallback).
 */
export function isMediaPreviewReady(
  asset: MediaAssetLike | null | undefined,
  jobsOverride?: JobsOverrideMap,
): boolean {
  if (!asset) return false;
  return getMediaReadiness(asset, jobsOverride).isPreviewReady;
}

/**
 * Resolves the concrete preview URL for an asset, preferring the 720p proxy URL for video
 * when ready and falling back to the original media URL when proxy is unavailable or failed.
 */
export function resolveMediaPreviewSource(
  asset: MediaAssetLike | null | undefined,
  jobsOverride?: JobsOverrideMap,
): {
  url: string | null;
  fallbackUrl: string | null;
  source: 'proxy' | 'original' | 'none';
  isProxy: boolean;
  isFallback: boolean;
} {
  if (!asset) {
    return { url: null, fallbackUrl: null, source: 'none', isProxy: false, isFallback: false };
  }

  const readiness = getMediaReadiness(asset, jobsOverride);
  const meta = (asset.metadata as Record<string, any>) || {};
  const proxyJob = getLiveJobEntry(asset.id, 'proxy', jobsOverride);

  const originalUrl =
    asset.originalPreviewUrl ||
    asset.previewUrl ||
    (typeof meta.originalSignedUrl === 'string' ? meta.originalSignedUrl : null) ||
    null;

  if (readiness.kind === 'video') {
    const proxyUrl =
      (readiness.derivatives.proxy.status === 'ready'
        ? proxyJob?.proxyUrl ||
          asset.proxyPreviewUrl ||
          (typeof meta.proxy?.signedUrl === 'string' ? meta.proxy.signedUrl : null) ||
          (typeof meta.proxy?.downloadUrl === 'string' ? meta.proxy.downloadUrl : null)
        : null) || null;

    if (proxyUrl) {
      return {
        url: proxyUrl,
        fallbackUrl: originalUrl,
        source: 'proxy',
        isProxy: true,
        isFallback: false,
      };
    }

    if (originalUrl && readiness.isPreviewReady) {
      return {
        url: originalUrl,
        fallbackUrl: null,
        source: 'original',
        isProxy: false,
        isFallback: true,
      };
    }

    return {
      url: null,
      fallbackUrl: originalUrl,
      source: readiness.preferredPreviewSource,
      isProxy: false,
      isFallback: readiness.preferredPreviewSource === 'original',
    };
  }

  if (originalUrl && readiness.isPreviewReady) {
    return {
      url: originalUrl,
      fallbackUrl: null,
      source: 'original',
      isProxy: false,
      isFallback: false,
    };
  }

  return {
    url: null,
    fallbackUrl: null,
    source: readiness.preferredPreviewSource,
    isProxy: false,
    isFallback: false,
  };
}

/**
 * Resolves the active signed thumbnail URL if the thumbnail derivative is ready.
 */
export function resolveMediaThumbnailUrl(
  asset: MediaAssetLike | null | undefined,
  jobsOverride?: JobsOverrideMap,
): string | null {
  if (!asset) return null;
  if (!isDerivativeReady(asset, 'thumbnail', jobsOverride)) return null;

  const thumbJob = getLiveJobEntry(asset.id, 'thumbnail', jobsOverride);
  if (thumbJob?.thumbnailUrl) return thumbJob.thumbnailUrl;
  if (asset.thumbnailSignedUrl) return asset.thumbnailSignedUrl;

  const meta = (asset.metadata as Record<string, any>) || {};
  if (typeof meta.thumbnail?.signedUrl === 'string') return meta.thumbnail.signedUrl;
  if (typeof meta.thumbnail?.downloadUrl === 'string') return meta.thumbnail.downloadUrl;

  if (asset.thumbnailUrl && /^https?:\/\//i.test(asset.thumbnailUrl)) {
    return asset.thumbnailUrl;
  }

  return null;
}
