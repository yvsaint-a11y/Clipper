import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ProjectItem } from '../projects/ProjectCard';
import { useEditorStore, EditorMediaAsset } from '../editor/stores/useEditorStore';
import { useMediaProcessingStore } from '../media/stores/useMediaProcessingStore';
import {
  isDerivativeReady,
  resolveMediaPreviewSource,
} from '../media/utils/mediaReadiness';
import { resolveTimelinePlaybackState } from '../editor/utils/playbackSync';
import { EditorToolbar } from '../editor/components/EditorToolbar';
import { EditorMediaLibrary } from '../editor/components/EditorMediaLibrary';
import { EditorViewport } from '../editor/components/EditorViewport';
import { EditorInspector } from '../editor/components/EditorInspector';
import { Timeline } from '../editor/components/Timeline';
import { SaveAsTemplateModal } from '../templates/components/SaveAsTemplateModal';
import { ReplaceSlotMediaModal } from './components/ReplaceSlotMediaModal';
import { FeedbackBanner, EmptyState } from '@/src/components/ui';
import { RefreshCw, Lock, AlertCircle, HardDrive, Settings, Layers } from 'lucide-react';

export interface ProjectWorkspaceProps {
  project: ProjectItem;
  onBack: () => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({ project: initialProject, onBack }) => {
  const { accessToken } = useAuth();
  const [projectData, setProjectData] = useState<ProjectItem>(initialProject);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Zustand Editor Store
  const {
    timeline,
    currentProject,
    projectMedia,
    selectedMediaAsset,
    selectedClipId,
    selectedTrackId,
    isMediaLoading,
    mediaError,
    isDirty,
    isSaving,
    lastSavedAt,
    lastSaveError,
    currentTimeMs,
    setProject,
    updateProjectMetadata,
    setProjectMedia,
    selectMediaAsset,
    updateMediaAssetPreviewUrl,
    updateMediaAssetDerivativeUrls,
    updateMediaAssetWaveform,
    setMediaLoading,
    setMediaError,
    markDirty,
    setSaving,
    setSaveError,
    recordSaved,
    addClipToTrack,
    updateClipTiming,
    updateClipTransform,
    resetClipTransform,
    updateClipCrop,
    resetClipCrop,
    updateTextClip,
    splitClip,
    removeClip,
    togglePlayback,
  } = useEditorStore();

  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [isLoadingPreviewUrl, setIsLoadingPreviewUrl] = useState(false);
  const [isSaveAsTemplateOpen, setIsSaveAsTemplateOpen] = useState(false);
  const [isReplaceSlotModalOpen, setIsReplaceSlotModalOpen] = useState(false);
  const [activeSlotKeyForModal, setActiveSlotKeyForModal] = useState<string | null>(null);
  const [mobilePanelTab, setMobilePanelTab] = useState<'media' | 'inspector' | 'both'>('media');

  // When a clip is selected on mobile/narrow viewport, auto-switch to inspector
  useEffect(() => {
    if (selectedClipId && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobilePanelTab('inspector');
    }
  }, [selectedClipId]);

  // Detect replaceable template slots in project timeline
  const replaceableSlots = React.useMemo(() => {
    const list: { slotKey: string; clip: any; track: any }[] = [];
    if (!timeline?.tracks) return list;
    for (const track of timeline.tracks) {
      for (const clip of (track.clips || [])) {
        if (clip.slotBinding) {
          list.push({ slotKey: clip.slotBinding, clip, track });
        }
      }
    }
    return list;
  }, [timeline]);

  const handleOpenReplaceSlot = (slotKey?: string) => {
    setActiveSlotKeyForModal(slotKey || null);
    setIsReplaceSlotModalOpen(true);
  };

  // 1. Fetch Real Project from Authenticated API
  const loadProjectDetails = useCallback(async () => {
    if (!accessToken || !initialProject.id) return;
    setIsProjectLoading(true);
    setProjectError(null);

    try {
      const res = await fetch(`/api/projects/${initialProject.id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load project details.');
      }

      const data = await res.json();
      setProjectData(data.project);
      setProject(data.project, data.timeline);
    } catch (err: unknown) {
      setProjectError(err instanceof Error ? err.message : 'Error loading project.');
    } finally {
      setIsProjectLoading(false);
    }
  }, [accessToken, initialProject.id, setProject]);

  // Keep local projectData in sync when store project changes
  useEffect(() => {
    if (currentProject) {
      setProjectData(currentProject);
    }
  }, [currentProject]);

  // 2. Fetch Real Project Media Assets
  const loadProjectMedia = useCallback(async () => {
    if (!accessToken) return;
    setMediaLoading(true);
    setMediaError(null);

    try {
      const res = await fetch('/api/media', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load media assets.');
      }

      const data = await res.json();
      const assets: EditorMediaAsset[] = (data.assets || []).map((a: any) => ({
        id: a.id,
        storageKey: a.storageKey,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        fileSizeBytes: Number(a.fileSizeBytes),
        ingestionStatus: a.ingestionStatus,
        hasAudio: a.hasAudio,
        durationMs: a.durationMs,
        width: a.width,
        height: a.height,
        fps: a.fps ?? null,
        thumbnailUrl: a.thumbnailUrl ?? null,
        waveformUrl: a.waveformUrl ?? null,
        metadata: a.metadata ?? null,
        createdAt: a.createdAt,
      }));

      setProjectMedia(assets);
    } catch (err: unknown) {
      setMediaError(err instanceof Error ? err.message : 'Failed to retrieve media library.');
    } finally {
      setMediaLoading(false);
    }
  }, [accessToken, setMediaLoading, setMediaError, setProjectMedia]);

  useEffect(() => {
    loadProjectDetails();
    loadProjectMedia();
    return () => {
      useMediaProcessingStore.getState().stopAllPolling();
    };
  }, [loadProjectDetails, loadProjectMedia]);

  // Helper to resolve preferred preview URL (720p proxy when ready, original fallback otherwise)
  // and load audio waveform data when ready without duplicate requests.
  const resolveAssetPreviewAndDerivatives = useCallback(
    async (asset: EditorMediaAsset): Promise<{ previewUrl: string | null; originalUrl: string | null }> => {
      if (!accessToken) return { previewUrl: null, originalUrl: null };

      const jobs = useMediaProcessingStore.getState().jobs;
      const isVideo = asset.mimeType.startsWith('video/');
      const isAudio = asset.mimeType.startsWith('audio/');

      // For audio with ready waveform, load waveform JSON once if not already cached
      if (isAudio && isDerivativeReady(asset, 'waveform', jobs)) {
        const waveJob = jobs[`${asset.id}:waveform`];
        if (waveJob?.waveformData && !asset.waveformData) {
          updateMediaAssetWaveform(asset.id, waveJob.waveformData as any);
        } else if (!asset.waveformData) {
          fetch(`/api/media/${asset.id}/waveform`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((waveData) => {
              if (waveData && Array.isArray(waveData.samples)) {
                updateMediaAssetWaveform(asset.id, waveData);
                useMediaProcessingStore.getState().setJobState(asset.id, 'waveform', {
                  status: 'ready',
                  waveformData: waveData,
                });
              }
            })
            .catch(() => {
              // Graceful fallback if waveform cannot be loaded
            });
        }
      }

      // Check already cached URLs first
      const resolved = resolveMediaPreviewSource(asset, jobs);
      if (resolved.url) {
        return {
          previewUrl: resolved.url,
          originalUrl: asset.originalPreviewUrl || resolved.fallbackUrl || resolved.url,
        };
      }

      let proxyUrl: string | null = null;
      let originalUrl: string | null = asset.originalPreviewUrl || asset.previewUrl || null;

      // 1. If video proxy is ready, prefer the 720p proxy signed URL
      if (isVideo && isDerivativeReady(asset, 'proxy', jobs)) {
        try {
          const proxyRes = await fetch(`/api/media/${asset.id}/download-url?type=proxy`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            proxyUrl = proxyData.downloadUrl || proxyData.signedUrl || null;
            if (proxyUrl) {
              useMediaProcessingStore.getState().setJobState(asset.id, 'proxy', {
                status: 'ready',
                proxyUrl,
              });
            }
          }
        } catch {
          // Graceful fallback to original media below
        }
      }

      // 2. Fetch original signed URL when proxy is unavailable or as authoritative fallback
      if (!originalUrl) {
        const origRes = await fetch(`/api/media/${asset.id}/download-url`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!origRes.ok) {
          if (proxyUrl) {
            updateMediaAssetDerivativeUrls(asset.id, {
              previewUrl: proxyUrl,
              proxyPreviewUrl: proxyUrl,
            });
            return { previewUrl: proxyUrl, originalUrl: null };
          }
          const errBody = await origRes.json().catch(() => ({}));
          throw new Error(errBody.error || 'Failed to generate download URL.');
        }
        const origData = await origRes.json();
        originalUrl = origData.downloadUrl || origData.signedUrl || null;
      }

      const preferredUrl = proxyUrl || originalUrl;
      updateMediaAssetDerivativeUrls(asset.id, {
        previewUrl: preferredUrl,
        proxyPreviewUrl: proxyUrl ?? asset.proxyPreviewUrl ?? null,
        originalPreviewUrl: originalUrl,
      });

      return { previewUrl: preferredUrl, originalUrl };
    },
    [accessToken, updateMediaAssetDerivativeUrls, updateMediaAssetWaveform],
  );

  // Canonical timeline playback resolution at currentTimeMs
  const timelinePlaybackState = React.useMemo(
    () => resolveTimelinePlaybackState(timeline, currentTimeMs, projectData.durationMs),
    [timeline, currentTimeMs, projectData.durationMs],
  );

  // Determine current active timeline clip strictly from currentTimeMs (null when in a gap, at timeline end, or when timeline is empty)
  const activeTimelineClip = timelinePlaybackState.activeClip;

  // Resolve the media asset corresponding to the active playback clip when present
  const activeClipMediaAsset = React.useMemo(() => {
    if (!activeTimelineClip || !(activeTimelineClip as any).mediaAssetId) return null;
    return projectMedia.find((m) => m.id === (activeTimelineClip as any).mediaAssetId) ?? null;
  }, [activeTimelineClip, projectMedia]);

  // Preserve media-library preview when timeline has no playable clips;
  // when timeline has clips, resolve strictly to the active clip's asset (or null in a gap)
  const viewportSelectedAsset = timelinePlaybackState.isEmpty
    ? selectedMediaAsset
    : activeTimelineClip
    ? activeClipMediaAsset
    : null;

  const viewportPreviewUrl = React.useMemo(() => {
    if (timelinePlaybackState.isEmpty) {
      return activePreviewUrl;
    }
    if (!activeTimelineClip || !activeClipMediaAsset) {
      return null;
    }
    const jobs = useMediaProcessingStore.getState().jobs;
    const resolved = resolveMediaPreviewSource(activeClipMediaAsset, jobs);
    if (resolved.url) {
      return resolved.url;
    }
    if (selectedMediaAsset?.id === activeClipMediaAsset.id) {
      return activePreviewUrl;
    }
    return null;
  }, [
    timelinePlaybackState.isEmpty,
    activeTimelineClip,
    activeClipMediaAsset,
    selectedMediaAsset?.id,
    activePreviewUrl,
  ]);

  // 3. Automatically synchronize media asset and preview URL when active timeline clip changes
  useEffect(() => {
    if (!activeTimelineClip || !(activeTimelineClip as any).mediaAssetId) {
      if (!timelinePlaybackState.isEmpty) {
        setIsLoadingPreviewUrl(false);
      }
      return;
    }

    const assetId = (activeTimelineClip as any).mediaAssetId;
    const existingAsset = projectMedia.find((m) => m.id === assetId);

    // Synchronize selectedMediaAsset with the active playback clip's asset
    if (existingAsset && (!selectedMediaAsset || selectedMediaAsset.id !== existingAsset.id)) {
      selectMediaAsset(existingAsset);
    }

    if (!existingAsset) return;

    const jobs = useMediaProcessingStore.getState().jobs;
    const resolved = resolveMediaPreviewSource(existingAsset, jobs);
    if (resolved.url) {
      setActivePreviewUrl(resolved.url);
      setIsLoadingPreviewUrl(false);
      if (existingAsset.mimeType.startsWith('audio/') && !existingAsset.waveformData && accessToken) {
        resolveAssetPreviewAndDerivatives(existingAsset).catch(() => {});
      }
      return;
    }

    if (!accessToken) return;

    let isCancelled = false;
    setIsLoadingPreviewUrl(true);

    resolveAssetPreviewAndDerivatives(existingAsset)
      .then(({ previewUrl }) => {
        if (isCancelled) return;
        setActivePreviewUrl(previewUrl);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn('[ProjectWorkspace] Could not load timeline clip media preview:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingPreviewUrl(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    activeTimelineClip,
    timelinePlaybackState.isEmpty,
    projectMedia,
    selectedMediaAsset,
    accessToken,
    selectMediaAsset,
    resolveAssetPreviewAndDerivatives,
  ]);

  // 4. Handle Media Selection & Generate Secure Download URL (Preferring 720p Proxy with Original Fallback)
  const handleSelectAsset = async (asset: EditorMediaAsset) => {
    selectMediaAsset(asset);

    const jobs = useMediaProcessingStore.getState().jobs;
    const resolved = resolveMediaPreviewSource(asset, jobs);
    if (resolved.url) {
      setActivePreviewUrl(resolved.url);
      // Still trigger non-blocking waveform load if audio
      if (asset.mimeType.startsWith('audio/') && !asset.waveformData) {
        resolveAssetPreviewAndDerivatives(asset).catch(() => {});
      }
      return;
    }

    if (!accessToken) return;
    setIsLoadingPreviewUrl(true);
    setActivePreviewUrl(null);

    try {
      const { previewUrl } = await resolveAssetPreviewAndDerivatives(asset);
      setActivePreviewUrl(previewUrl);
    } catch (err: unknown) {
      console.error('Error generating preview download URL:', err);
      setMediaError(err instanceof Error ? err.message : 'Failed to stream media.');
    } finally {
      setIsLoadingPreviewUrl(false);
    }
  };

  // 5. Add Asset to Timeline Helper
  const handleAddAssetToTimeline = (asset: EditorMediaAsset) => {
    if (!timeline?.tracks || timeline.tracks.length === 0) return;
    const targetTrack = timeline.tracks.find((t) => t.trackType === 'video') || timeline.tracks[0];
    if (!targetTrack) return;

    // Calculate start time as furthest clip end time
    let nextStartMs = 0;
    for (const clip of (targetTrack.clips || [])) {
      if (clip.endTimeMs > nextStartMs) {
        nextStartMs = clip.endTimeMs;
      }
    }

    const durationMs = asset.durationMs && asset.durationMs > 0 ? Math.min(asset.durationMs, 60000) : 5000;

    addClipToTrack(targetTrack.id, {
      name: asset.originalFilename,
      clipType: asset.mimeType.startsWith('video/') ? 'video' : (asset.mimeType.startsWith('audio/') ? 'audio' : 'image'),
      mediaAssetId: asset.id,
      startTimeMs: nextStartMs,
      endTimeMs: nextStartMs + durationMs,
      sourceStartMs: 0,
      sourceEndMs: durationMs,
    });
  };

  // 6. Persistence / Transactional Save Handler
  const handleSaveProject = useCallback(async () => {
    const proj = currentProject || projectData;
    if (!accessToken || !proj?.id || isSaving) return;
    setSaving(true);
    setProjectError(null);

    try {
      // Build snapshot string at the moment of initiating save
      const { buildClientCanonicalSnapshot, computeClientStateString } = await import('../editor/utils/projectSnapshot');
      const inFlightSnapshot = buildClientCanonicalSnapshot({
        projectId: proj.id,
        name: proj.name,
        aspectRatio: proj.aspectRatio,
        resolution: proj.resolution || '1080p',
        fps: proj.fps || 30,
        durationMs: timeline?.totalDurationMs || proj.durationMs || 0,
        tracks: timeline?.tracks || [],
      });
      const inFlightSnapshotString = computeClientStateString(inFlightSnapshot);

      const res = await fetch(`/api/projects/${proj.id}/editor-state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: proj.name,
          description: proj.description,
          aspectRatio: proj.aspectRatio,
          resolution: proj.resolution,
          fps: proj.fps,
          durationMs: timeline?.totalDurationMs || proj.durationMs,
          timeline: {
            tracks: timeline?.tracks || [],
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save project editor state.');
      }

      const data = await res.json();
      recordSaved(inFlightSnapshotString);
      if (data.project) {
        setProjectData(data.project);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save project state.';
      console.error('Error saving project:', err);
      setSaveError(msg);
      setProjectError(msg);
    }
  }, [accessToken, currentProject, projectData, timeline, isSaving, setSaving, recordSaved, setSaveError]);

  const handleOpenSaveAsTemplate = useCallback(() => {
    if (isDirty) {
      handleSaveProject();
    }
    setIsSaveAsTemplateOpen(true);
  }, [isDirty, handleSaveProject]);

  // 7. Global Keyboard Shortcut (Ctrl+S / ⌘S, Space: Play/Pause, Delete/Backspace: Remove Selected Clip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
        return;
      }

      if (!isInput && e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
        return;
      }

      if (!isInput && (e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        removeClip(selectedClipId);
        return;
      }

      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 's' && selectedClipId) {
        e.preventDefault();
        splitClip(selectedClipId);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSaveProject, togglePlayback, removeClip, splitClip, selectedClipId]);

  // 8. Conservative Debounced Autosave (15 seconds after dirty edit)
  useEffect(() => {
    if (!isDirty || isSaving) return;

    const timer = setTimeout(() => {
      handleSaveProject();
    }, 15000);

    return () => {
      clearTimeout(timer);
    };
  }, [isDirty, isSaving, handleSaveProject]);

  if (!accessToken) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<Lock className="w-8 h-8 text-zinc-400" />}
          title="Session Authentication Required"
          description="You must be authenticated to load and edit project timelines."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-[calc(100dvh-115px)] sm:h-[calc(100vh-140px)] min-h-[560px] sm:min-h-[640px] border border-[#292B2D] rounded-xl overflow-hidden bg-[#080909] shadow-2xl">
      {/* 1. TOP: Editor Toolbar */}
      <EditorToolbar
        projectName={projectData.name}
        aspectRatio={projectData.aspectRatio}
        resolution={projectData.resolution}
        fps={projectData.fps}
        isDirty={isDirty}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        lastSaveError={lastSaveError}
        onSave={handleSaveProject}
        onSaveAsTemplate={handleOpenSaveAsTemplate}
        onBack={onBack}
        onTitleChange={(newTitle) => {
          updateProjectMetadata({ name: newTitle });
        }}
        replaceableSlotCount={replaceableSlots.length}
        onOpenReplaceSlotMedia={() => handleOpenReplaceSlot()}
      />

      {/* Global Error Banner if project failed to load */}
      {projectError && (
        <div className="p-2 shrink-0">
          <FeedbackBanner
            type="error"
            title="Project Notice"
            message={projectError}
            onDismiss={() => setProjectError(null)}
          />
        </div>
      )}

      {/* 2. MIDDLE: Left Media Library + Center Viewport + Right Inspector */}
      {/* Desktop (lg+): 3 side-by-side columns; Mobile/Tablet (<lg): Viewport on top + Segmented Stacked Panels below */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-h-0 divide-y lg:divide-y-0 divide-[#292B2D]">
        {/* Center: Video Preview & Canvas Viewport */}
        {/* On mobile, Preview is rendered on top (order-1) so it stays immediately accessible */}
        <div className="w-full lg:flex-1 h-64 xs:h-72 sm:h-96 lg:h-full min-w-0 shrink-0 lg:shrink flex flex-col items-center justify-center order-1 lg:order-2">
          <EditorViewport
            aspectRatio={projectData.aspectRatio}
            selectedAsset={viewportSelectedAsset}
            videoPreviewUrl={viewportPreviewUrl}
            fallbackPreviewUrl={viewportSelectedAsset?.originalPreviewUrl || null}
            isLoadingUrl={isLoadingPreviewUrl}
            activeClip={activeTimelineClip}
          />
        </div>

        {/* Mobile Panel Mode Switcher (visible only on < lg) */}
        <div className="lg:hidden order-2 p-2 bg-[#141516] border-y border-[#292B2D] flex items-center justify-between gap-1.5 shrink-0 select-none">
          <button
            type="button"
            onClick={() => setMobilePanelTab('media')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mobilePanelTab === 'media'
                ? 'bg-[#252628] text-white border border-[#3A3C3F] shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-[#1B1C1E]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-[#C7C9CC]" />
            <span>Media ({projectMedia.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobilePanelTab('inspector')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mobilePanelTab === 'inspector'
                ? 'bg-[#252628] text-white border border-[#3A3C3F] shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-[#1B1C1E]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-[#C7C9CC]" />
            <span>Inspector</span>
          </button>

          <button
            type="button"
            onClick={() => setMobilePanelTab('both')}
            className={`py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
              mobilePanelTab === 'both'
                ? 'bg-[#252628] text-white border border-[#3A3C3F] shadow-xs'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1B1C1E]'
            }`}
            title="Stack both panels"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Both</span>
          </button>
        </div>

        {/* Left: Media Library */}
        {/* On desktop: left column (w-64 sm:w-72 shrink-0 h-full) */}
        {/* On mobile: full width panel when mobilePanelTab === 'media' or 'both' */}
        <div
          className={`${
            mobilePanelTab === 'media' || mobilePanelTab === 'both' ? 'flex flex-col' : 'hidden'
          } lg:flex lg:flex-col w-full lg:w-64 xl:w-72 shrink-0 h-72 sm:h-80 lg:h-full order-3 lg:order-1 border-b lg:border-b-0 lg:border-r border-[#292B2D] overflow-hidden`}
        >
          <EditorMediaLibrary
            mediaAssets={projectMedia}
            selectedAsset={selectedMediaAsset}
            isLoading={isMediaLoading}
            error={mediaError}
            onSelectAsset={handleSelectAsset}
            onRefresh={loadProjectMedia}
            onAddToTimeline={handleAddAssetToTimeline}
          />
        </div>

        {/* Right: Technical Inspector */}
        {/* On desktop: right column (w-64 sm:w-72 shrink-0 h-full) */}
        {/* On mobile: full width panel when mobilePanelTab === 'inspector' || 'both' */}
        <div
          className={`${
            mobilePanelTab === 'inspector' || mobilePanelTab === 'both' ? 'flex flex-col' : 'hidden'
          } lg:flex lg:flex-col w-full lg:w-64 xl:w-72 shrink-0 h-72 sm:h-80 lg:h-full order-4 lg:order-3 border-t lg:border-t-0 lg:border-l border-[#292B2D] overflow-hidden`}
        >
          {(() => {
            let activeClip: any = null;
            let activeTrack: any = null;
            if (selectedClipId && timeline?.tracks) {
              for (const track of timeline.tracks) {
                const clip = track.clips?.find((c: any) => c.id === selectedClipId);
                if (clip) {
                  activeClip = clip;
                  activeTrack = track;
                  break;
                }
              }
            } else if (selectedTrackId && timeline?.tracks) {
              activeTrack = timeline.tracks.find((t: any) => t.id === selectedTrackId);
            }
            const inspectorAsset =
              activeClip && (activeClip as any).mediaAssetId
                ? projectMedia.find((m) => m.id === (activeClip as any).mediaAssetId) ?? selectedMediaAsset
                : selectedMediaAsset;

            return (
              <EditorInspector
                selectedAsset={inspectorAsset}
                selectedClip={activeClip}
                selectedTrack={activeTrack}
                projectMetadata={{
                  name: projectData.name,
                  aspectRatio: projectData.aspectRatio,
                  resolution: projectData.resolution,
                  fps: projectData.fps,
                  id: projectData.id,
                }}
                onClipTimingChange={(clipId, startMs, endMs) => {
                  updateClipTiming(clipId, startMs, endMs);
                }}
                onClipTransformChange={(clipId, updates) => {
                  updateClipTransform(clipId, updates);
                }}
                onClipTransformReset={(clipId) => {
                  resetClipTransform(clipId);
                }}
                onClipCropChange={(clipId, updates) => {
                  updateClipCrop(clipId, updates);
                }}
                onClipCropReset={(clipId) => {
                  resetClipCrop(clipId);
                }}
                onTextClipChange={(clipId, updates) => {
                  updateTextClip(clipId, updates);
                }}
                onClipDelete={(clipId) => {
                  removeClip(clipId);
                }}
                onProjectAspectChange={(aspect) => {
                  updateProjectMetadata({ aspectRatio: aspect });
                }}
                onOpenReplaceSlotMedia={(slotKey) => {
                  handleOpenReplaceSlot(slotKey);
                }}
              />
            );
          })()}
        </div>
      </div>

      {/* 3. BOTTOM: Timeline Engine Workspace */}
      <Timeline
        timeline={timeline}
        durationMs={projectData.durationMs || 0}
        fps={projectData.fps || 30}
      />

      {/* 4. MODAL: Save Project as Template */}
      {isSaveAsTemplateOpen && (
        <SaveAsTemplateModal
          isOpen={isSaveAsTemplateOpen}
          onClose={() => setIsSaveAsTemplateOpen(false)}
          project={projectData}
          timeline={timeline}
          accessToken={accessToken}
        />
      )}

      {/* 5. MODAL: Replace Template Media */}
      {isReplaceSlotModalOpen && (
        <ReplaceSlotMediaModal
          isOpen={isReplaceSlotModalOpen}
          onClose={() => {
            setIsReplaceSlotModalOpen(false);
            setActiveSlotKeyForModal(null);
          }}
          projectId={projectData.id}
          accessToken={accessToken}
          slots={replaceableSlots}
          initialSlotKey={activeSlotKeyForModal}
          mediaAssets={projectMedia}
          onSuccess={(updatedProject, updatedTimeline) => {
            setProjectData(updatedProject);
            setProject(updatedProject, updatedTimeline);
          }}
        />
      )}
    </div>
  );
};
