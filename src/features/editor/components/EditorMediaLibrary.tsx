import React, { useEffect, useRef, useState } from 'react';
import { Surface, FeedbackBanner } from '@/src/components/ui';
import { EditorMediaAsset } from '../stores/useEditorStore';
import {
  useMediaProcessingStore,
  type MediaOperation,
} from '@/src/features/media/stores/useMediaProcessingStore';
import {
  getMediaReadiness,
  isDerivativeReady,
  resolveMediaThumbnailUrl,
  type DerivativeType,
} from '@/src/features/media/utils/mediaReadiness';
import { useAuth } from '@/src/features/auth/AuthContext';
import {
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Film,
  Plus,
} from 'lucide-react';

export interface EditorMediaLibraryProps {
  mediaAssets: EditorMediaAsset[];
  selectedAsset: EditorMediaAsset | null;
  isLoading: boolean;
  error: string | null;
  onSelectAsset: (asset: EditorMediaAsset) => void;
  onRefresh: () => void;
  onAddToTimeline?: (asset: EditorMediaAsset) => void;
}

// Track which asset thumbnails have already been requested in this session to avoid repeated requests
const fetchedThumbnailIds = new Set<string>();

export function resetFetchedThumbnailCache(): void {
  fetchedThumbnailIds.clear();
}

const AssetThumbOrIcon: React.FC<{
  asset: EditorMediaAsset;
  defaultIcon: React.ReactNode;
  accessToken?: string | null;
}> = ({ asset, defaultIcon, accessToken }) => {
  const jobs = useMediaProcessingStore((s) => s.jobs);
  const setJobState = useMediaProcessingStore((s) => s.setJobState);
  const [imgError, setImgError] = useState(false);

  const thumbReady = isDerivativeReady(asset, 'thumbnail', jobs);
  const resolvedThumbUrl = resolveMediaThumbnailUrl(asset, jobs);

  useEffect(() => {
    setImgError(false);
  }, [resolvedThumbUrl]);

  useEffect(() => {
    if (!thumbReady || resolvedThumbUrl || !accessToken) return;
    if (fetchedThumbnailIds.has(asset.id)) return;

    fetchedThumbnailIds.add(asset.id);
    let cancelled = false;

    fetch(`/api/media/${asset.id}/thumbnail-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const url = data.signedUrl || data.downloadUrl || null;
        if (url) {
          setJobState(asset.id, 'thumbnail', {
            status: 'ready',
            thumbnailUrl: url,
            error: null,
          });
        }
      })
      .catch(() => {
        // Non-fatal fallback to default icon
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id, thumbReady, resolvedThumbUrl, accessToken, setJobState]);

  if (thumbReady && resolvedThumbUrl && !imgError) {
    return (
      <img
        src={resolvedThumbUrl}
        alt={asset.originalFilename}
        onError={() => setImgError(true)}
        className="w-7 h-7 rounded object-cover border border-[#292B2D] shrink-0"
      />
    );
  }
  return <>{defaultIcon}</>;
};

function toRetryableOperation(derivative: DerivativeType): MediaOperation | null {
  if (derivative === 'probe' || derivative === 'proxy' || derivative === 'thumbnail' || derivative === 'waveform') {
    return derivative;
  }
  return null;
}

export const EditorMediaLibrary: React.FC<EditorMediaLibraryProps> = ({
  mediaAssets,
  selectedAsset,
  isLoading,
  error,
  onSelectAsset,
  onRefresh,
  onAddToTimeline,
}) => {
  const { accessToken } = useAuth();
  const jobs = useMediaProcessingStore((s) => s.jobs);
  const requestProcessing = useMediaProcessingStore((s) => s.requestProcessing);
  const assetsRef = useRef<EditorMediaAsset[]>(mediaAssets);
  assetsRef.current = mediaAssets;

  // Cleanup active polling when EditorMediaLibrary unmounts
  useEffect(() => {
    return () => {
      const store = useMediaProcessingStore.getState();
      for (const asset of assetsRef.current) {
        store.stopAssetPolling(asset.id);
      }
    };
  }, []);

  const getMediaIcon = (mime: string) => {
    if (mime.startsWith('video/')) return <FileVideo className="w-4 h-4 text-[#C7C9CC] shrink-0" />;
    if (mime.startsWith('audio/')) return <FileAudio className="w-4 h-4 text-[#92969C] shrink-0" />;
    return <ImageIcon className="w-4 h-4 text-[#B4B6B9] shrink-0" />;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleRetryFailedDerivatives = async (
    e: React.MouseEvent,
    asset: EditorMediaAsset,
    failedList: DerivativeType[],
  ) => {
    e.stopPropagation();
    if (!accessToken) return;

    for (const failedType of failedList) {
      const op = toRetryableOperation(failedType);
      if (op) {
        await requestProcessing(asset.id, op, accessToken);
      }
    }
  };

  return (
    <Surface level={2} className="h-full flex flex-col border-r border-[#292B2D] bg-[#0B0C0D] overflow-hidden select-none">
      {/* Library Header */}
      <div className="p-3.5 border-b border-[#292B2D] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#C7C9CC]" />
          <h3 className="text-xs font-semibold text-white tracking-tight">Project Media</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#080909] text-[#92969C] border border-[#292B2D]">
            {mediaAssets.length}
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-[#202123] transition-colors cursor-pointer"
          title="Refresh project media library"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#C7C9CC]' : ''}`} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-2 shrink-0">
          <FeedbackBanner
            type="error"
            title="Media notice"
            message={error}
            onDismiss={() => {}}
          />
        </div>
      )}

      {/* Asset List View */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && mediaAssets.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw className="w-5 h-5 text-[#C7C9CC] animate-spin mx-auto mb-2" />
            <span>Loading media from Cloudflare R2...</span>
          </div>
        ) : mediaAssets.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
            <Film className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="font-medium text-zinc-400">No media assets in library</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Upload video footage, audio stems, or images via the Media tab to add assets to your workspace.
            </p>
          </div>
        ) : (
          mediaAssets.map((asset) => {
            const isSelected = selectedAsset?.id === asset.id;
            const readiness = getMediaReadiness(asset, jobs);
            const canAddToTimeline =
              readiness.isAssetUsable && readiness.derivatives.probe.status !== 'processing';

            return (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectAsset(asset)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectAsset(asset);
                  }
                }}
                data-testid={`editor-media-item-${asset.id}`}
                data-readiness-status={readiness.status}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#1B1C1E] border-[#C7C9CC] shadow-[0_0_12px_rgba(255,255,255,0.12)]'
                    : 'bg-[#141516] border-[#292B2D] hover:border-[#686B70] hover:bg-[#1B1C1E]'
                }`}
              >
                {/* Thumbnail or icon */}
                <AssetThumbOrIcon
                  asset={asset}
                  defaultIcon={getMediaIcon(asset.mimeType)}
                  accessToken={accessToken}
                />

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-200 truncate" title={asset.originalFilename}>
                    {asset.originalFilename}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-500 font-mono flex-wrap">
                    <span>{formatBytes(asset.fileSizeBytes)}</span>
                    <span>•</span>
                    <span className="uppercase">{asset.mimeType.split('/')[1] || 'media'}</span>
                    {asset.durationMs ? (
                      <>
                        <span>•</span>
                        <span>{(asset.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    ) : null}
                  </div>

                  {/* Readiness Status Badge & Retry Controls */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {readiness.status === 'processing' && (
                      <span
                        data-testid={`media-status-processing-${asset.id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1B1C1E] border border-[#3A3C3F] text-[#C7C9CC]"
                      >
                        <RefreshCw className="w-2.5 h-2.5 animate-spin text-[#C7C9CC]" />
                        <span>Processing</span>
                      </span>
                    )}

                    {readiness.status === 'pending' && (
                      <span
                        data-testid={`media-status-pending-${asset.id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#141516] border border-[#292B2D] text-zinc-400"
                      >
                        <span>Pending</span>
                      </span>
                    )}

                    {readiness.isFullyReady && (
                      <span
                        data-testid={`media-status-ready-${asset.id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#141F16] border border-[#2E5C38] text-[#86EFAC]"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 text-[#86EFAC]" />
                        <span>Ready</span>
                      </span>
                    )}

                    {readiness.hasFailedDerivatives && (
                      <>
                        <span
                          data-testid={`media-status-failed-${asset.id}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#291415] border border-[#5C2E30] text-[#FCA5A5]"
                          title={`Failed: ${readiness.failedDerivatives.join(', ')}`}
                        >
                          <AlertCircle className="w-2.5 h-2.5 text-[#FCA5A5]" />
                          <span>
                            {readiness.failedDerivatives.length === 1
                              ? `${readiness.failedDerivatives[0]} failed`
                              : 'Derivative failed'}
                          </span>
                        </span>

                        <button
                          type="button"
                          data-testid={`media-retry-btn-${asset.id}`}
                          onClick={(e) => handleRetryFailedDerivatives(e, asset, readiness.failedDerivatives)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] text-zinc-200 hover:text-white transition-colors cursor-pointer"
                          title={`Retry ${readiness.failedDerivatives.join(', ')}`}
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Retry</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C7C9CC] shrink-0" />
                )}

                {onAddToTimeline && (
                  <button
                    type="button"
                    data-testid={`add-to-timeline-${asset.id}`}
                    disabled={!canAddToTimeline}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canAddToTimeline) return;
                      onAddToTimeline(asset);
                    }}
                    title={
                      canAddToTimeline
                        ? 'Add clip to timeline'
                        : 'Media metadata is still processing or unavailable'
                    }
                    className="p-1 rounded bg-[#1B1C1E] hover:bg-[#3A3C3F] disabled:opacity-40 disabled:cursor-not-allowed border border-[#3A3C3F] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 border-t border-[#292B2D] text-[10px] text-zinc-500 flex items-center justify-between shrink-0 bg-[#080909]">
        <span>Single-click to select & preview</span>
        <span className="font-mono text-zinc-600">Phase 8H</span>
      </div>
    </Surface>
  );
};
