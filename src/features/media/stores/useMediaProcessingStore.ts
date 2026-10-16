import { create } from 'zustand';

export type MediaProcessingStatus = 'idle' | 'queued' | 'processing' | 'ready' | 'failed';
export type MediaOperation = 'probe' | 'proxy' | 'thumbnail' | 'waveform';

export interface MediaJobState {
  assetId: string;
  operation: MediaOperation;
  jobId: string | null;
  status: MediaProcessingStatus;
  error: string | null;
  attemptsMade?: number;
  thumbnailUrl?: string | null;
  proxyUrl?: string | null;
  waveformData?: Record<string, unknown> | null;
  updatedAt: string;
}

export interface MediaProcessingStoreState {
  // Keyed by `${assetId}:${operation}`
  jobs: Record<string, MediaJobState>;

  // Actions
  getJobState: (assetId: string, operation: MediaOperation) => MediaJobState;
  requestProcessing: (
    assetId: string,
    operation: MediaOperation,
    accessToken: string,
    customFetch?: typeof fetch,
  ) => Promise<{ jobId: string; status: MediaProcessingStatus } | null>;
  pollJobStatus: (
    jobId: string,
    assetId: string,
    operation: MediaOperation,
    accessToken: string,
    customFetch?: typeof fetch,
    pollIntervalMs?: number,
  ) => void;
  stopPolling: (jobId: string) => void;
  stopAssetPolling: (assetId: string) => void;
  stopAllPolling: () => void;
  isPolling: (jobId: string) => boolean;
  getActivePollingCount: () => number;
  setJobState: (assetId: string, operation: MediaOperation, updates: Partial<MediaJobState>) => void;
  resetJob: (assetId: string, operation: MediaOperation) => void;
}

// Active polling interval IDs to prevent duplicate polling and memory leaks
const activePollingIntervals = new Map<string, NodeJS.Timeout | number>();

export function getJobKey(assetId: string, operation: MediaOperation): string {
  return `${assetId}:${operation}`;
}

export const useMediaProcessingStore = create<MediaProcessingStoreState>((set, get) => ({
  jobs: {},

  getJobState: (assetId: string, operation: MediaOperation): MediaJobState => {
    const key = getJobKey(assetId, operation);
    return (
      get().jobs[key] || {
        assetId,
        operation,
        jobId: null,
        status: 'idle',
        error: null,
        updatedAt: new Date().toISOString(),
      }
    );
  },

  setJobState: (assetId: string, operation: MediaOperation, updates: Partial<MediaJobState>) => {
    const key = getJobKey(assetId, operation);
    set((state) => {
      const current = state.jobs[key] || {
        assetId,
        operation,
        jobId: null,
        status: 'idle',
        error: null,
        updatedAt: new Date().toISOString(),
      };
      return {
        jobs: {
          ...state.jobs,
          [key]: {
            ...current,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  resetJob: (assetId: string, operation: MediaOperation) => {
    const key = getJobKey(assetId, operation);
    const existing = get().jobs[key];
    if (existing?.jobId) {
      get().stopPolling(existing.jobId);
    }
    set((state) => {
      const updated = { ...state.jobs };
      delete updated[key];
      return { jobs: updated };
    });
  },

  requestProcessing: async (
    assetId: string,
    operation: MediaOperation,
    accessToken: string,
    customFetch: typeof fetch = fetch,
  ) => {
    const key = getJobKey(assetId, operation);
    const currentState = get().getJobState(assetId, operation);

    // Disable requesting if already actively queued or processing
    if (currentState.status === 'queued' || currentState.status === 'processing') {
      return null;
    }

    get().setJobState(assetId, operation, {
      status: 'queued',
      error: null,
    });

    try {
      const res = await customFetch(`/api/media/${assetId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ operation }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to enqueue media processing.';
        try {
          const body = await res.json();
          if (body.error) errMessage = body.error;
        } catch {
          // Keep default message
        }

        get().setJobState(assetId, operation, {
          status: 'failed',
          error: errMessage,
        });
        return null;
      }

      const data = await res.json();
      const jobId = data.jobId;
      const initialStatus: MediaProcessingStatus =
        data.status === 'active' ? 'processing' : 'queued';

      get().setJobState(assetId, operation, {
        jobId,
        status: initialStatus,
        error: null,
      });

      // Start automatic polling for this background job
      if (jobId) {
        get().pollJobStatus(jobId, assetId, operation, accessToken, customFetch);
      }

      return { jobId, status: initialStatus };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error enqueueing job.';
      get().setJobState(assetId, operation, {
        status: 'failed',
        error: msg,
      });
      return null;
    }
  },

  pollJobStatus: (
    jobId: string,
    assetId: string,
    operation: MediaOperation,
    accessToken: string,
    customFetch: typeof fetch = fetch,
    pollIntervalMs: number = 1500,
  ) => {
    // Avoid creating duplicate polling intervals for the same job
    if (activePollingIntervals.has(jobId)) {
      return;
    }

    const checkJob = async () => {
      try {
        const res = await customFetch(`/api/media/jobs/${jobId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          if (res.status === 404 || res.status === 401) {
            get().stopPolling(jobId);
            get().setJobState(assetId, operation, {
              status: 'failed',
              error: 'Media job not found or access expired.',
            });
          }
          return;
        }

        const jobSummary = await res.json();
        const state = jobSummary.state;

        if (state === 'completed') {
          get().stopPolling(jobId);

          let thumbnailUrl: string | null = null;
          let proxyUrl: string | null = null;
          let waveformData: Record<string, unknown> | null = null;

          // Retrieve derivative signed URL / data based on operation
          try {
            if (operation === 'thumbnail') {
              const thumbRes = await customFetch(`/api/media/${assetId}/thumbnail-url`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (thumbRes.ok) {
                const thumbData = await thumbRes.json();
                thumbnailUrl = thumbData.signedUrl || thumbData.downloadUrl || null;
              }
            } else if (operation === 'proxy') {
              const proxyRes = await customFetch(
                `/api/media/${assetId}/download-url?type=proxy`,
                {
                  headers: { Authorization: `Bearer ${accessToken}` },
                },
              );
              if (proxyRes.ok) {
                const proxyData = await proxyRes.json();
                proxyUrl = proxyData.downloadUrl || null;
              }
            } else if (operation === 'waveform') {
              const waveRes = await customFetch(`/api/media/${assetId}/waveform`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (waveRes.ok) {
                waveformData = await waveRes.json();
              }
            }
          } catch {
            // Derivative fetch non-fatal; derivative is still marked ready
          }

          get().setJobState(assetId, operation, {
            status: 'ready',
            error: null,
            attemptsMade: jobSummary.attemptsMade,
            thumbnailUrl,
            proxyUrl,
            waveformData,
          });

          // Phase 8G: When probe job completes, automatically poll chained derivatives
          if (operation === 'probe') {
            const retResult = (jobSummary.returnvalue?.result as Record<string, any>) || {};
            const assetMime = (retResult.asset?.mimeType as string) || '';
            const isVideo = assetMime.startsWith('video/') || Boolean(retResult.probedMetadata?.videoCodec);
            const isAudio =
              assetMime.startsWith('audio/') || (!isVideo && Boolean(retResult.probedMetadata?.audioCodec));

            if (isVideo) {
              get().pollJobStatus(`media:${assetId}:proxy`, assetId, 'proxy', accessToken, customFetch);
              get().pollJobStatus(`media:${assetId}:thumbnail`, assetId, 'thumbnail', accessToken, customFetch);
            } else if (isAudio) {
              get().pollJobStatus(`media:${assetId}:waveform`, assetId, 'waveform', accessToken, customFetch);
            }
          }
        } else if (state === 'failed') {
          get().stopPolling(jobId);
          get().setJobState(assetId, operation, {
            status: 'failed',
            error: jobSummary.failedReason || 'Job failed during background processing.',
            attemptsMade: jobSummary.attemptsMade,
          });
        } else if (state === 'active') {
          get().setJobState(assetId, operation, {
            status: 'processing',
            attemptsMade: jobSummary.attemptsMade,
          });
        } else {
          // 'waiting' | 'delayed'
          get().setJobState(assetId, operation, {
            status: 'queued',
            attemptsMade: jobSummary.attemptsMade,
          });
        }
      } catch {
        // Network glitches during polling are tolerated until next interval
      }
    };

    // Execute first check immediately, then schedule recurring interval
    checkJob();
    const timer = setInterval(checkJob, pollIntervalMs);
    activePollingIntervals.set(jobId, timer);
  },

  stopPolling: (jobId: string) => {
    const timer = activePollingIntervals.get(jobId);
    if (timer) {
      clearInterval(timer as NodeJS.Timeout);
      activePollingIntervals.delete(jobId);
    }
  },

  stopAssetPolling: (assetId: string) => {
    if (!assetId) return;
    const ops: MediaOperation[] = ['probe', 'proxy', 'thumbnail', 'waveform'];
    for (const op of ops) {
      const state = get().getJobState(assetId, op);
      if (state.jobId) {
        get().stopPolling(state.jobId);
      }
      get().stopPolling(`media:${assetId}:${op}`);
    }
  },

  stopAllPolling: () => {
    activePollingIntervals.forEach((timer) => clearInterval(timer as NodeJS.Timeout));
    activePollingIntervals.clear();
  },

  isPolling: (jobId: string) => {
    return activePollingIntervals.has(jobId);
  },

  getActivePollingCount: () => {
    return activePollingIntervals.size;
  },
}));
