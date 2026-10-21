import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, FeedbackBanner } from '@/src/components/ui';
import {
  Film,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Loader2,
  HardDrive,
  Sparkles,
  Info,
  RefreshCw,
} from 'lucide-react';
import type { ExportResolution } from '@/src/types/render';
import {
  buildCanonicalRenderSpec,
  computeRenderSpecHash,
} from '../utils/renderSpec';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    aspectRatio: string;
    resolution?: string;
    fps?: number;
    durationMs?: number;
    version?: number;
  };
  timeline: any;
  mediaAssets: any[];
  accessToken: string | null;
}

export interface ActiveRenderJobView {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  progressPercentage: number;
  currentStep: string;
  resolution: ExportResolution;
  fps: number;
  downloadUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  timeline,
  mediaAssets,
  accessToken,
}) => {
  const [selectedResolution, setSelectedResolution] = useState<ExportResolution>(
    (project.resolution as ExportResolution) === '720p' ? '720p' : '1080p',
  );
  const [selectedFps, setSelectedFps] = useState<30 | 60>(
    project.fps === 60 ? 60 : 30,
  );
  const [includeWatermark, setIncludeWatermark] = useState(false);

  // Export submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveRenderJobView | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const durationMs = timeline?.totalDurationMs || project.durationMs || 0;
  const durationSec = Math.max(0, Math.round(durationMs / 1000));

  // Honest estimated file size calculation based on target bitrates:
  // 1080p @ 30fps ~ 8Mbps, 60fps ~ 12Mbps
  // 720p @ 30fps ~ 4Mbps, 60fps ~ 6Mbps
  const estimatedBitrateMbps =
    selectedResolution === '1080p'
      ? selectedFps === 60
        ? 12
        : 8
      : selectedFps === 60
        ? 6
        : 4;
  const estimatedFileSizeBytes = Math.round((estimatedBitrateMbps * 1000000 * durationSec) / 8);
  const estimatedFileSizeMB = (estimatedFileSizeBytes / (1024 * 1024)).toFixed(1);

  // Poll job status if queued or processing
  useEffect(() => {
    if (!isOpen || !activeJob || (activeJob.status !== 'queued' && activeJob.status !== 'processing')) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/renders/${activeJob.id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.job) {
            setActiveJob({
              id: data.job.id,
              status: data.job.status,
              progressPercentage: data.job.progressPercentage ?? 0,
              currentStep: data.job.currentStep ?? 'queued',
              resolution: data.job.resolution,
              fps: data.job.fps,
              downloadUrl: data.job.downloadUrl,
              errorMessage: data.job.errorMessage,
              createdAt: data.job.createdAt,
            });
            if (data.job.status === 'completed' || data.job.status === 'failed') {
              setIsPolling(false);
            }
          }
        }
      } catch (err) {
        console.warn('[ExportModal] Failed to poll render job status:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, activeJob?.id, activeJob?.status, accessToken]);

  const handleStartExport = async () => {
    if (!accessToken) {
      setSubmitError('Authentication required to export projects.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // 1. Build canonical render specification
      const spec = buildCanonicalRenderSpec({
        project,
        timeline,
        mediaAssets,
        exportOptions: {
          resolution: selectedResolution,
          fps: selectedFps,
          watermark: includeWatermark,
        },
      });

      // 2. Submit to backend export endpoint
      const res = await fetch(`/api/projects/${project.id}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          resolution: selectedResolution,
          fps: selectedFps,
          watermark: includeWatermark,
          renderSpec: spec,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start export job.');
      }

      if (data?.job) {
        setActiveJob({
          id: data.job.id,
          status: data.job.status,
          progressPercentage: data.job.progressPercentage ?? 0,
          currentStep: data.job.currentStep ?? 'queued',
          resolution: data.job.resolution,
          fps: data.job.fps,
          downloadUrl: data.job.downloadUrl,
          errorMessage: data.job.errorMessage,
          createdAt: data.job.createdAt,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export request failed.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#06070a]/80 backdrop-blur-md"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          className="relative z-10 w-full max-w-xl flex flex-col bg-[#0B0C0D] border border-[#292B2D] rounded-2xl shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#292B2D] bg-[#141516]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Export Video</h3>
                  <Badge variant="outline" className="text-[10px] font-mono py-0.5 border-[#3A3C3F] text-[#C7C9CC]">
                    V1 Engine
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Deterministic MP4 video export with Cloudflare R2 delivery.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Close Export"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
            {submitError && (
              <FeedbackBanner variant="error" title="Export Error" message={submitError} />
            )}

            {/* Active Job Status Card */}
            {activeJob ? (
              <div className="p-4 rounded-xl border border-[#292B2D] bg-[#111214] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Job #{activeJob.id.slice(0, 8)}</span>
                    <Badge
                      variant={
                        activeJob.status === 'completed'
                          ? 'success'
                          : activeJob.status === 'failed'
                            ? 'error'
                            : 'info'
                      }
                      className="text-[10px] uppercase font-mono tracking-wider"
                    >
                      {activeJob.status}
                    </Badge>
                  </div>
                  {isPolling && (
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                      <span>Syncing</span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>{activeJob.currentStep || 'Initializing'}</span>
                    <span>{activeJob.progressPercentage}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1B1C1E] overflow-hidden border border-[#292B2D]">
                    <div
                      className={`h-full transition-all duration-300 ${
                        activeJob.status === 'completed'
                          ? 'bg-emerald-500'
                          : activeJob.status === 'failed'
                            ? 'bg-rose-500'
                            : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.max(activeJob.progressPercentage, 5)}%` }}
                    />
                  </div>
                </div>

                {/* Status Notice */}
                {activeJob.status === 'queued' && (
                  <div className="p-3 rounded-lg bg-[#18191B] border border-[#292B2D] flex items-start gap-2 text-xs text-zinc-300">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Render job is securely queued in the database. When Redis queue workers are connected, frame-accurate rendering will process this job.
                    </p>
                  </div>
                )}

                {activeJob.status === 'failed' && (
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 flex items-start gap-2 text-xs text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {activeJob.errorMessage || 'Rendering failed. Please verify your timeline media assets and retry.'}
                    </p>
                  </div>
                )}

                {/* Download Button (Only when completed with verified URL) */}
                {activeJob.status === 'completed' && activeJob.downloadUrl && (
                  <div className="pt-2">
                    <a
                      href={activeJob.downloadUrl}
                      download={`clipper_export_${activeJob.id.slice(0, 8)}.mp4`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download Rendered Video (.mp4)
                    </a>
                  </div>
                )}
              </div>
            ) : null}

            {/* Export Settings Form */}
            <div className="space-y-4">
              {/* Resolution Selection */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-2 block">
                  Export Resolution (Max 1080p)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedResolution('1080p')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedResolution === '1080p'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-[#292B2D] bg-[#111214] text-zinc-400 hover:border-[#3A3C3F]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">1080p Full HD</div>
                    <div className="text-[11px] text-zinc-400">1920×1080 • Production Quality</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedResolution('720p')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedResolution === '720p'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-[#292B2D] bg-[#111214] text-zinc-400 hover:border-[#3A3C3F]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">720p HD</div>
                    <div className="text-[11px] text-zinc-400">1280×720 • Fast Web Share</div>
                  </button>
                </div>
              </div>

              {/* Frame Rate Selection */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-2 block">
                  Frame Rate
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedFps(30)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedFps === 30
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-[#292B2D] bg-[#111214] text-zinc-400 hover:border-[#3A3C3F]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">30 FPS</div>
                    <div className="text-[11px] text-zinc-400">Standard cinematic web rate</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFps(60)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedFps === 60
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-[#292B2D] bg-[#111214] text-zinc-400 hover:border-[#3A3C3F]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">60 FPS</div>
                    <div className="text-[11px] text-zinc-400">Smooth high-motion playback</div>
                  </button>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="p-3.5 rounded-xl border border-[#292B2D] bg-[#0E0F11] grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-mono">Duration</div>
                  <div className="text-xs font-bold text-white mt-0.5">{durationSec}s</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-mono">Aspect</div>
                  <div className="text-xs font-bold text-white mt-0.5">{project.aspectRatio || '16:9'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-mono">Est. Size</div>
                  <div className="text-xs font-bold text-white mt-0.5">~{estimatedFileSizeMB} MB</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3.5 border-t border-[#292B2D] bg-[#141516] flex items-center justify-between">
            <MotionButton variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 hover:text-white">
              Cancel
            </MotionButton>

            <div className="flex items-center gap-2">
              <MotionButton
                variant="primary"
                size="sm"
                onClick={handleStartExport}
                disabled={isSubmitting || durationSec <= 0}
                isLoading={isSubmitting}
                leftIcon={<Film className="w-3.5 h-3.5" />}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4"
              >
                {activeJob ? 'Re-Export / New Job' : 'Start Export'}
              </MotionButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
