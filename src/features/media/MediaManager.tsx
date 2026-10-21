import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../auth/AuthContext';
import { useMediaProcessingStore } from './stores/useMediaProcessingStore';
import { parsePresignUploadResponse } from './uploadContract';
import { Surface, MotionButton, Badge, FeedbackBanner, EmptyState } from '../../components/ui';
import { motionTokens } from '../../lib/designTokens';
import {
  UploadCloud,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Lock,
  HardDrive,
  ShieldCheck,
  Clock,
  Sparkles,
  ExternalLink,
  Film,
} from 'lucide-react';

interface MediaAssetItem {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  ingestionStatus: string;
  hasAudio: boolean;
  durationMs?: number;
  width?: number;
  height?: number;
  createdAt: string;
}

const MediaProcessingRowControls: React.FC<{
  asset: MediaAssetItem;
  accessToken: string;
}> = ({ asset, accessToken }) => {
  const store = useMediaProcessingStore();
  const isVideo = asset.mimeType.startsWith('video/');
  const isAudio = asset.mimeType.startsWith('audio/');

  const thumbJob = store.getJobState(asset.id, 'thumbnail');
  const proxyJob = store.getJobState(asset.id, 'proxy');
  const waveJob = store.getJobState(asset.id, 'waveform');

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {isVideo && (
        <button
          type="button"
          onClick={() => store.requestProcessing(asset.id, 'thumbnail', accessToken)}
          disabled={thumbJob.status === 'queued' || thumbJob.status === 'processing'}
          title={
            thumbJob.status === 'ready'
              ? 'Thumbnail Ready (Click to regenerate)'
              : thumbJob.status === 'failed'
              ? `Failed: ${thumbJob.error || 'Retry'}`
              : 'Generate Thumbnail'
          }
          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
            thumbJob.status === 'ready'
              ? 'bg-[#141F16] border-[#2E5C38] text-[#86EFAC]'
              : thumbJob.status === 'failed'
              ? 'bg-[#291415] border-[#5C2E30] text-[#FCA5A5]'
              : thumbJob.status === 'queued' || thumbJob.status === 'processing'
              ? 'bg-[#1B1C1E] border-[#3A3C3F] text-zinc-400'
              : 'bg-[#1B1C1E] border-[#292B2D] text-zinc-300 hover:text-white hover:border-[#686B70]'
          }`}
        >
          {thumbJob.status === 'queued' || thumbJob.status === 'processing' ? (
            <RefreshCw className="w-3 h-3 animate-spin text-[#C7C9CC]" />
          ) : thumbJob.status === 'ready' ? (
            <CheckCircle2 className="w-3 h-3 text-[#86EFAC]" />
          ) : thumbJob.status === 'failed' ? (
            <AlertCircle className="w-3 h-3 text-[#FCA5A5]" />
          ) : (
            <Sparkles className="w-3 h-3 text-[#C7C9CC]" />
          )}
          <span>
            {thumbJob.status === 'queued'
              ? 'Queued'
              : thumbJob.status === 'processing'
              ? 'Processing'
              : thumbJob.status === 'ready'
              ? 'Thumbnail'
              : thumbJob.status === 'failed'
              ? 'Retry'
              : 'Thumbnail'}
          </span>
        </button>
      )}

      {isVideo && (
        <button
          type="button"
          onClick={() => store.requestProcessing(asset.id, 'proxy', accessToken)}
          disabled={proxyJob.status === 'queued' || proxyJob.status === 'processing'}
          title={
            proxyJob.status === 'ready'
              ? 'Proxy Ready (Click to regenerate)'
              : proxyJob.status === 'failed'
              ? `Failed: ${proxyJob.error || 'Retry'}`
              : 'Generate 720p Proxy'
          }
          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
            proxyJob.status === 'ready'
              ? 'bg-[#141F16] border-[#2E5C38] text-[#86EFAC]'
              : proxyJob.status === 'failed'
              ? 'bg-[#291415] border-[#5C2E30] text-[#FCA5A5]'
              : proxyJob.status === 'queued' || proxyJob.status === 'processing'
              ? 'bg-[#1B1C1E] border-[#3A3C3F] text-zinc-400'
              : 'bg-[#1B1C1E] border-[#292B2D] text-zinc-300 hover:text-white hover:border-[#686B70]'
          }`}
        >
          {proxyJob.status === 'queued' || proxyJob.status === 'processing' ? (
            <RefreshCw className="w-3 h-3 animate-spin text-[#C7C9CC]" />
          ) : proxyJob.status === 'ready' ? (
            <CheckCircle2 className="w-3 h-3 text-[#86EFAC]" />
          ) : proxyJob.status === 'failed' ? (
            <AlertCircle className="w-3 h-3 text-[#FCA5A5]" />
          ) : (
            <Film className="w-3 h-3 text-[#C7C9CC]" />
          )}
          <span>
            {proxyJob.status === 'queued'
              ? 'Queued'
              : proxyJob.status === 'processing'
              ? 'Processing'
              : proxyJob.status === 'ready'
              ? 'Proxy'
              : proxyJob.status === 'failed'
              ? 'Retry'
              : 'Proxy'}
          </span>
        </button>
      )}

      {isAudio && (
        <button
          type="button"
          onClick={() => store.requestProcessing(asset.id, 'waveform', accessToken)}
          disabled={waveJob.status === 'queued' || waveJob.status === 'processing'}
          title={
            waveJob.status === 'ready'
              ? 'Waveform Ready (Click to regenerate)'
              : waveJob.status === 'failed'
              ? `Failed: ${waveJob.error || 'Retry'}`
              : 'Generate Audio Waveform'
          }
          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
            waveJob.status === 'ready'
              ? 'bg-[#141F16] border-[#2E5C38] text-[#86EFAC]'
              : waveJob.status === 'failed'
              ? 'bg-[#291415] border-[#5C2E30] text-[#FCA5A5]'
              : waveJob.status === 'queued' || waveJob.status === 'processing'
              ? 'bg-[#1B1C1E] border-[#3A3C3F] text-zinc-400'
              : 'bg-[#1B1C1E] border-[#292B2D] text-zinc-300 hover:text-white hover:border-[#686B70]'
          }`}
        >
          {waveJob.status === 'queued' || waveJob.status === 'processing' ? (
            <RefreshCw className="w-3 h-3 animate-spin text-[#C7C9CC]" />
          ) : waveJob.status === 'ready' ? (
            <CheckCircle2 className="w-3 h-3 text-[#86EFAC]" />
          ) : waveJob.status === 'failed' ? (
            <AlertCircle className="w-3 h-3 text-[#FCA5A5]" />
          ) : (
            <FileAudio className="w-3 h-3 text-[#C7C9CC]" />
          )}
          <span>
            {waveJob.status === 'queued'
              ? 'Queued'
              : waveJob.status === 'processing'
              ? 'Processing'
              : waveJob.status === 'ready'
              ? 'Waveform'
              : waveJob.status === 'failed'
              ? 'Retry'
              : 'Waveform'}
          </span>
        </button>
      )}
    </div>
  );
};

const AssetThumbnailOrIcon: React.FC<{ asset: MediaAssetItem; defaultIcon: React.ReactNode }> = ({ asset, defaultIcon }) => {
  const store = useMediaProcessingStore();
  const thumbState = store.getJobState(asset.id, 'thumbnail');
  if (thumbState?.thumbnailUrl) {
    return (
      <img
        src={thumbState.thumbnailUrl}
        alt={asset.originalFilename}
        className="w-7 h-7 rounded object-cover border border-[#292B2D] shrink-0"
      />
    );
  }
  return <>{defaultIcon}</>;
};

export const MediaManager: React.FC = () => {
  const { user, accessToken, profile, isConfigured } = useAuth();
  const [assets, setAssets] = useState<MediaAssetItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/media', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (err) {
      console.error('Failed to load media assets', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchAssets();
    } else {
      setAssets([]);
    }
  }, [accessToken]);

  const handleFileUpload = async (file: File) => {
    if (!accessToken || !user) {
      setErrorMessage('Please sign in to upload media to your private Cloudflare R2 bucket.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(0);
    setUploadStatus('Requesting signed PUT URL...');

    try {
      // Step 1: Request presigned upload URL
      const presignRes = await fetch('/api/media/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        }),
      });

      if (!presignRes.ok) {
        const errData = await presignRes.json();
        throw new Error(errData.error || 'Failed to authorize upload.');
      }

      const data = await presignRes.json();
      const { assetId, uploadUrl, requiredHeaders } = parsePresignUploadResponse(data);

      // Step 2: Upload directly to R2 via XMLHttpRequest with progress tracking
      setUploadStatus('Transferring to Cloudflare R2...');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);

        if (requiredHeaders) {
          Object.entries(requiredHeaders).forEach(([header, value]) => {
            xhr.setRequestHeader(header, String(value));
          });
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage provider rejected upload with HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during R2 binary upload.'));
        xhr.send(file);
      });

      // Step 3: Complete upload and persist server-side metadata in PostgreSQL database
      setUploadStatus('Verifying object integrity in PostgreSQL...');

      // Extract client-side metadata where available (duration, dimensions)
      let durationMs: number | undefined;
      let width: number | undefined;
      let height: number | undefined;

      try {
        if (file.type.startsWith('video/')) {
          const videoEl = document.createElement('video');
          videoEl.preload = 'metadata';
          const url = URL.createObjectURL(file);
          await new Promise<void>((resolve) => {
            videoEl.onloadedmetadata = () => {
              if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
                durationMs = Math.round(videoEl.duration * 1000);
              }
              if (videoEl.videoWidth) width = videoEl.videoWidth;
              if (videoEl.videoHeight) height = videoEl.videoHeight;
              resolve();
            };
            videoEl.onerror = () => resolve();
            videoEl.src = url;
          });
          URL.revokeObjectURL(url);
        } else if (file.type.startsWith('audio/')) {
          const audioEl = document.createElement('audio');
          audioEl.preload = 'metadata';
          const url = URL.createObjectURL(file);
          await new Promise<void>((resolve) => {
            audioEl.onloadedmetadata = () => {
              if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                durationMs = Math.round(audioEl.duration * 1000);
              }
              resolve();
            };
            audioEl.onerror = () => resolve();
            audioEl.src = url;
          });
          URL.revokeObjectURL(url);
        } else if (file.type.startsWith('image/')) {
          const img = new Image();
          const url = URL.createObjectURL(file);
          await new Promise<void>((resolve) => {
            img.onload = () => {
              width = img.naturalWidth;
              height = img.naturalHeight;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
          });
          URL.revokeObjectURL(url);
        }
      } catch {
        // Non-blocking fallback
      }

      const completeRes = await fetch(`/api/media/${assetId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          durationMs,
          width,
          height,
        }),
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json();
        throw new Error(errData.error || 'Failed to finalize asset.');
      }

      const completeData = await completeRes.json();
      if (completeData?.jobs && Array.isArray(completeData.jobs)) {
        const store = useMediaProcessingStore.getState();
        for (const jId of completeData.jobs) {
          if (typeof jId === 'string' && jId.endsWith(':probe')) {
            store.pollJobStatus(jId, assetId, 'probe', accessToken);
          }
        }
      }

      setSuccessMessage(`Successfully uploaded and verified "${file.name}" in R2.`);
      await fetchAssets();
      setUploadStatus(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setErrorMessage(msg);
      setUploadStatus(null);
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (assetId: string) => {
    if (!accessToken) return;
    setDownloadingAssetId(assetId);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/media/${assetId}/download-url`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to retrieve download link.');
      }

      const data = await res.json();
      window.open(data.downloadUrl, '_blank');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed.';
      setErrorMessage(msg);
    } finally {
      setDownloadingAssetId(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getMediaIcon = (mime: string) => {
    if (mime.startsWith('video/')) return <FileVideo className="w-4 h-4 text-[#C7C9CC]" />;
    if (mime.startsWith('audio/')) return <FileAudio className="w-4 h-4 text-[#92969C]" />;
    return <ImageIcon className="w-4 h-4 text-[#B4B6B9]" />;
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone Card with D1 Surface and D4 Reactive states */}
      <Surface level={2} className="p-6 border-[#292B2D] bg-[#141516]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#292B2D] gap-2">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-[#C7C9CC]" />
              Secure Media Storage (Cloudflare R2)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Private, zero-egress object storage with user-scoped keys and short-lived presigned URLs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] border-[#3A3C3F] bg-[#1B1C1E] text-zinc-300 font-mono gap-1.5">
              <Lock className="w-3 h-3 text-[#C7C9CC]" />
              User-Scoped: <code className="text-[#C7C9CC]">raw/{user?.id?.slice(0, 8) || 'user'}/*</code>
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          {!user ? (
            <EmptyState
              icon={<Lock className="w-6 h-6 text-zinc-400" />}
              title="Authentication Required"
              description="Sign in with verified Supabase credentials to unlock your private Cloudflare R2 bucket and manage video assets."
            />
          ) : (
            <>
              {/* D4 Reactive Drop Zone */}
              <motion.div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                animate={{
                  scale: isDragOver ? 1.01 : 1,
                  borderColor: isDragOver ? '#C7C9CC' : '#292B2D',
                  backgroundColor: isDragOver ? 'rgba(199, 201, 204, 0.08)' : 'rgba(20, 21, 22, 0.7)',
                }}
                transition={{ duration: motionTokens.duration.micro }}
                className="group relative p-8 rounded-xl border border-dashed cursor-pointer transition-all text-center space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/aac,image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-full bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#F2F2F0] mx-auto shadow-sm group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-6 h-6" />
                </div>

                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    <span className="text-[#C7C9CC] group-hover:underline">Click to browse</span> or drag & drop high-res footage
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Direct S3 PUT bypasses server memory • Max 500MB (MP4, WebM, MOV, MP3, WAV, PNG, JPG)
                  </p>
                </div>
              </motion.div>

              {/* Upload Progress Bar */}
              {uploadProgress !== null && (
                <Surface level={1} className="p-3.5 space-y-2 border-[#3A3C3F] bg-[#141516]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#F2F2F0] font-medium flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C7C9CC]" />
                      {uploadStatus || 'Uploading...'}
                    </span>
                    <span className="font-mono text-[#C7C9CC]">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1B1C1E] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#92969C] via-[#C7C9CC] to-white rounded-full"
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ ease: 'linear' }}
                    />
                  </div>
                </Surface>
              )}

              {/* Status Notifications */}
              {errorMessage && (
                <FeedbackBanner
                  type="error"
                  title="Upload Issue"
                  message={errorMessage}
                  onDismiss={() => setErrorMessage(null)}
                />
              )}

              {successMessage && (
                <FeedbackBanner
                  type="success"
                  title="Upload Complete"
                  message={successMessage}
                  onDismiss={() => setSuccessMessage(null)}
                />
              )}
            </>
          )}
        </div>
      </Surface>

      {/* Asset Library Table / Grid */}
      <Surface level={2} className="p-6 border-[#292B2D] bg-[#101112]">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#292B2D]">
          <div>
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-[#C7C9CC]" />
              Private Asset Repository
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Strictly authenticated media assets isolated by tenant UUID.
            </p>
          </div>
          {user && (
            <MotionButton
              variant="outline"
              size="xs"
              isLoading={isLoading}
              onClick={fetchAssets}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Refresh Library
            </MotionButton>
          )}
        </div>

        {!user ? (
          <EmptyState
            icon={<Lock className="w-5 h-5 text-zinc-400" />}
            title="Repository Locked"
            description="Sign in to view and download your private media assets."
          />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<Film className="w-5 h-5 text-zinc-400" />}
            title="No Media Ingested"
            description="Upload your raw video, audio, or image files above to build your timeline assets."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#292B2D] text-zinc-400 font-medium">
                  <th className="pb-3 pl-2">Asset Filename</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Size</th>
                  <th className="pb-3">Ingestion Status</th>
                  <th className="pb-3 text-right pr-3">Derivatives</th>
                  <th className="pb-3 text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#292B2D]/60">
                {assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pl-2 font-medium text-white">
                      <div className="flex items-center gap-2.5">
                        <AssetThumbnailOrIcon asset={asset} defaultIcon={getMediaIcon(asset.mimeType)} />
                        <div className="min-w-0">
                          <span className="truncate max-w-[200px] block" title={asset.originalFilename}>
                            {asset.originalFilename}
                          </span>
                          {(asset.width || asset.durationMs) && (
                            <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                              {asset.width && asset.height ? `${asset.width}×${asset.height}` : ''}
                              {asset.width && asset.durationMs ? ' • ' : ''}
                              {asset.durationMs ? `${(asset.durationMs / 1000).toFixed(1)}s` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-zinc-400 font-mono">{asset.mimeType}</td>
                    <td className="py-3 text-zinc-400 font-mono">{formatBytes(asset.fileSizeBytes)}</td>
                    <td className="py-3">
                      <Badge variant={asset.ingestionStatus === 'ready' ? 'success' : 'warning'}>
                        {asset.ingestionStatus}
                      </Badge>
                    </td>
                    <td className="py-3 text-right pr-3">
                      <MediaProcessingRowControls asset={asset} accessToken={accessToken || ''} />
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <MotionButton
                        variant="secondary"
                        size="xs"
                        disabled={downloadingAssetId === asset.id || asset.ingestionStatus !== 'ready'}
                        isLoading={downloadingAssetId === asset.id}
                        onClick={() => handleDownload(asset.id)}
                        leftIcon={<Download className="w-3 h-3" />}
                      >
                        Download
                      </MotionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
};
