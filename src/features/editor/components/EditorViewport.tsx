import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Surface, Badge, FeedbackBanner } from '@/src/components/ui';
import { useEditorStore, EditorMediaAsset } from '../stores/useEditorStore';
import {
  timelineToSourceSeconds,
  sourceSecondsToTimelineMs,
  isEmptyTimeline,
  resolveTimelinePlaybackState,
  resolveVideoClipTimeUpdate,
  resolveTimelineSeek,
} from '../utils/playbackSync';
import { buildClipTransformStyle } from '../utils/clipTransform';
import { buildClipCropCss } from '../utils/clipCrop';
import { getActiveTextClipsAtTime } from '../utils/textClip';
import {
  calculateEffectiveAudioVolume,
  normalizeAudioClipProperties,
  toHtmlMediaElementVolume,
} from '../utils/audioClip';
import { getActiveTransitionStateForClip } from '../utils/clipTransition';
import { useMediaProcessingStore } from '@/src/features/media/stores/useMediaProcessingStore';
import {
  getMediaReadiness,
  isDerivativeReady,
  resolveMediaPreviewSource,
} from '@/src/features/media/utils/mediaReadiness';
import {
  Film,
  Play,
  Pause,
  AlertCircle,
  RefreshCw,
  Monitor,
  Volume2,
  VolumeX,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';

export interface EditorViewportProps {
  aspectRatio: string;
  selectedAsset: EditorMediaAsset | null;
  videoPreviewUrl: string | null;
  fallbackPreviewUrl?: string | null;
  isLoadingUrl: boolean;
  activeClip?: any | null;
  onRefreshMediaUrl?: () => void;
}

export const EditorViewport: React.FC<EditorViewportProps> = ({
  aspectRatio,
  selectedAsset,
  videoPreviewUrl,
  fallbackPreviewUrl,
  isLoadingUrl,
  activeClip,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [usingFallbackOriginal, setUsingFallbackOriginal] = useState(false);

  const jobs = useMediaProcessingStore((s) => s.jobs);

  const readiness = selectedAsset ? getMediaReadiness(selectedAsset, jobs) : null;
  const resolvedSource = selectedAsset
    ? resolveMediaPreviewSource(
        {
          ...selectedAsset,
          previewUrl: selectedAsset.previewUrl || videoPreviewUrl,
          originalPreviewUrl: selectedAsset.originalPreviewUrl || fallbackPreviewUrl || videoPreviewUrl,
        },
        jobs,
      )
    : null;

  const effectivePreviewUrl =
    usingFallbackOriginal
      ? fallbackPreviewUrl || selectedAsset?.originalPreviewUrl || videoPreviewUrl
      : resolvedSource?.url || videoPreviewUrl;

  const isProxyStream = Boolean(!usingFallbackOriginal && resolvedSource?.isProxy && effectivePreviewUrl);

  // Store subscriptions
  const {
    timeline,
    currentProject,
    currentTimeMs,
    isPlaying,
    playbackRate,
    setCurrentTimeMs,
    setIsPlaying,
    setIsVideoDrivenPlayback,
  } = useEditorStore();

  const projectDurationMs = currentProject?.durationMs ?? timeline?.totalDurationMs ?? null;
  const hasTimelinePlayableClips = React.useMemo(
    () => !isEmptyTimeline(timeline),
    [timeline],
  );
  const playbackInput = React.useMemo(
    () => (hasTimelinePlayableClips ? timeline : activeClip ? [activeClip] : timeline),
    [hasTimelinePlayableClips, timeline, activeClip],
  );
  const timelinePlaybackState = React.useMemo(
    () => resolveTimelinePlaybackState(playbackInput, currentTimeMs, projectDurationMs),
    [playbackInput, currentTimeMs, projectDurationMs],
  );

  // Resolve the active playback clip at currentTimeMs without arbitrary fallback during gaps
  const resolvedActiveClip = hasTimelinePlayableClips
    ? activeClip !== undefined
      ? activeClip
      : timelinePlaybackState.activeClip
    : activeClip ?? null;

  const hasAnyPlayableClips = hasTimelinePlayableClips || Boolean(resolvedActiveClip);
  const isInTimelineGap = hasTimelinePlayableClips && timelinePlaybackState.isGap && !resolvedActiveClip;
  const isInTimelineGapOrEnd = hasTimelinePlayableClips && !resolvedActiveClip;

  const activeTransitionState = getActiveTransitionStateForClip(
    timeline,
    resolvedActiveClip?.id,
    currentTimeMs,
  );
  const baseTransformStyle = buildClipTransformStyle(resolvedActiveClip?.transform);
  const effectiveClipOpacity =
    activeTransitionState && activeTransitionState.evaluation.type === 'crossfade'
      ? activeTransitionState.effectiveOpacity
      : baseTransformStyle.opacity;

  const clipTransformStyle = {
    ...baseTransformStyle,
    opacity: effectiveClipOpacity,
    clipPath: buildClipCropCss(resolvedActiveClip?.crop),
  };

  const activeTextClips = getActiveTextClipsAtTime(timeline, currentTimeMs);
  const activeAudioProps = resolvedActiveClip ? normalizeAudioClipProperties(resolvedActiveClip) : null;
  const baseEffectiveAudioVolume = resolvedActiveClip
    ? calculateEffectiveAudioVolume(resolvedActiveClip, currentTimeMs)
    : 1;
  const transitionAudioFactor =
    activeTransitionState && activeTransitionState.evaluation.type === 'crossfade'
      ? activeTransitionState.effectiveAudioFactor
      : 1;
  const effectiveAudioVolume = baseEffectiveAudioVolume * transitionAudioFactor;
  const htmlMediaVolume = toHtmlMediaElementVolume(effectiveAudioVolume);
  const isEffectiveMuted = resolvedActiveClip
    ? Boolean(activeAudioProps?.muted || effectiveAudioVolume <= 0)
    : false;

  // Synchronize effective audio volume and mute state with HTML5 media elements
  useEffect(() => {
    if (audioRef.current && resolvedActiveClip) {
      audioRef.current.volume = htmlMediaVolume;
      audioRef.current.muted = isEffectiveMuted;
    }
    if (videoRef.current && resolvedActiveClip && (resolvedActiveClip.audioProperties || activeTransitionState)) {
      videoRef.current.volume = htmlMediaVolume;
      videoRef.current.muted = isEffectiveMuted;
    }
  }, [resolvedActiveClip, htmlMediaVolume, isEffectiveMuted, activeTransitionState]);

  const lastSynchronizedMs = useRef<number>(-1);
  const activeClipRef = useRef<any | null>(resolvedActiveClip);
  const lastActiveClipIdRef = useRef<string | null>(resolvedActiveClip?.id ?? null);
  const lastLoadedVideoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    activeClipRef.current = resolvedActiveClip;
  }, [resolvedActiveClip]);

  const isVideo = Boolean(
    selectedAsset?.mimeType.startsWith('video/') ||
      (effectivePreviewUrl &&
        !selectedAsset?.mimeType.startsWith('image/') &&
        !selectedAsset?.mimeType.startsWith('audio/')) ||
      (isInTimelineGapOrEnd && lastLoadedVideoUrlRef.current),
  );
  const isAudio = Boolean(selectedAsset?.mimeType.startsWith('audio/'));
  const isImage = Boolean(selectedAsset?.mimeType.startsWith('image/'));

  if (effectivePreviewUrl && !isAudio && !isImage) {
    lastLoadedVideoUrlRef.current = effectivePreviewUrl;
  } else if (!hasTimelinePlayableClips && !effectivePreviewUrl) {
    lastLoadedVideoUrlRef.current = null;
  }

  const activeVideoIdentity =
    selectedAsset && videoPreviewUrl ? `${selectedAsset.id}:${videoPreviewUrl}` : null;
  const prevVideoIdentityRef = useRef<string | null>(null);

  // Reset errors and buffering state when switching to a different media asset or preview URL
  useEffect(() => {
    if (!activeVideoIdentity) {
      if (!hasTimelinePlayableClips) {
        prevVideoIdentityRef.current = null;
        setVideoError(null);
        setIsVideoReady(false);
        setIsVideoBuffering(false);
        setVideoMetadata(null);
        setUsingFallbackOriginal(false);
      }
      return;
    }

    if (prevVideoIdentityRef.current !== activeVideoIdentity) {
      prevVideoIdentityRef.current = activeVideoIdentity;
      setVideoError(null);
      setIsVideoReady(false);
      setIsVideoBuffering(false);
      setVideoMetadata(null);
      setUsingFallbackOriginal(false);
    }
  }, [activeVideoIdentity, hasTimelinePlayableClips]);

  // Handle Playback Rate synchronization with HTML5 video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate || 1.0;
    }
  }, [playbackRate]);

  // Dimension scaling calculation for viewport canvas stage
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] w-auto h-full max-h-[85%] max-w-[90%] sm:w-[240px] sm:h-[426px]';
      case '1:1':
        return 'aspect-square w-auto h-auto max-w-[90%] max-h-[85%] sm:w-[360px] sm:h-[360px]';
      default: // 16:9
        return 'aspect-[16/9] w-full max-w-[95%] sm:max-w-[560px] max-h-[85%]';
    }
  };

  // 1. TIMELINE -> VIDEO SEEK SYNCHRONIZATION
  // When currentTimeMs changes (e.g. user scrubbed, clicked ruler, or timeline gap clock advanced)
  useEffect(() => {
    const video = videoRef.current;

    if (hasAnyPlayableClips) {
      const seekResolution = resolveTimelineSeek(
        playbackInput,
        currentTimeMs,
        projectDurationMs,
        video?.duration,
      );

      // Seeking to or reaching timeline end: clamp to effective timeline end and stop playback
      if (seekResolution.isTimelineEnded) {
        activeClipRef.current = null;
        lastActiveClipIdRef.current = null;
        if (currentTimeMs !== seekResolution.currentTimeMs) {
          setCurrentTimeMs(seekResolution.currentTimeMs);
        }
        setIsVideoDrivenPlayback(false);
        if (isPlaying) {
          setIsPlaying(false);
        }
        if (video) {
          video.pause();
        }
        return;
      }

      // Seeking into or advancing through a gap: switch to non-video-driven gap playback
      if (seekResolution.isGap || !seekResolution.activeClip) {
        activeClipRef.current = null;
        lastActiveClipIdRef.current = null;
        setIsVideoDrivenPlayback(false);
        if (video) {
          video.pause();
        }
        return;
      }

      const targetClip = resolvedActiveClip || seekResolution.activeClip;
      const didClipChange = lastActiveClipIdRef.current !== targetClip.id;
      activeClipRef.current = targetClip;
      lastActiveClipIdRef.current = targetClip.id;

      if (!video || !isVideo || !effectivePreviewUrl) {
        return;
      }

      // If video is currently playing and driving time within the same clip, skip external seeking
      if (
        isPlaying &&
        !didClipChange &&
        Math.abs(currentTimeMs - (lastSynchronizedMs.current || 0)) < 150
      ) {
        return;
      }

      const { sourceSec: targetSourceSec } = timelineToSourceSeconds(
        seekResolution.currentTimeMs,
        targetClip,
        video.duration,
      );

      if ((isVideoReady || didClipChange) && Math.abs(video.currentTime - targetSourceSec) > 0.08) {
        video.currentTime = targetSourceSec;
      }
      lastSynchronizedMs.current = seekResolution.currentTimeMs;

      if (isPlaying && didClipChange) {
        setIsVideoDrivenPlayback(true);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            if (err?.name === 'AbortError') return;
            console.warn('[EditorViewport] Video play error on clip transition:', err);
            setIsPlaying(false);
            setIsVideoDrivenPlayback(false);
          });
        }
      }
      return;
    }

    // Direct asset preview (when timeline has no playable clips)
    if (!video || !isVideo || !effectivePreviewUrl || !isVideoReady) return;

    if (isPlaying && Math.abs(currentTimeMs - (lastSynchronizedMs.current || 0)) < 150) {
      return;
    }

    const durationSec =
      video.duration || (selectedAsset?.durationMs ? selectedAsset.durationMs / 1000 : 60);
    const targetSourceSec = Math.max(0, Math.min(currentTimeMs / 1000, durationSec));

    if (Math.abs(video.currentTime - targetSourceSec) > 0.08) {
      video.currentTime = targetSourceSec;
    }
    lastSynchronizedMs.current = currentTimeMs;
  }, [
    currentTimeMs,
    hasAnyPlayableClips,
    playbackInput,
    projectDurationMs,
    resolvedActiveClip,
    isVideo,
    effectivePreviewUrl,
    isVideoReady,
    isPlaying,
    setCurrentTimeMs,
    setIsPlaying,
    setIsVideoDrivenPlayback,
    selectedAsset,
  ]);

  // 2. PLAY / PAUSE SYNCHRONIZATION (Store -> HTML5 Video)
  useEffect(() => {
    const video = videoRef.current;

    if (!isPlaying) {
      setIsVideoDrivenPlayback(false);
      if (video) {
        video.pause();
      }
      return;
    }

    if (hasAnyPlayableClips) {
      if (timelinePlaybackState.isTimelineEnded) {
        setIsVideoDrivenPlayback(false);
        setIsPlaying(false);
        if (currentTimeMs !== timelinePlaybackState.currentTimeMs) {
          setCurrentTimeMs(timelinePlaybackState.currentTimeMs);
        }
        if (video) {
          video.pause();
        }
        return;
      }

      if (timelinePlaybackState.isGap || !resolvedActiveClip) {
        // Playhead is in a gap: keep isPlaying true, let timeline clock drive playback
        setIsVideoDrivenPlayback(false);
        if (video) {
          video.pause();
        }
        return;
      }

      if (!video || !isVideo || !effectivePreviewUrl) {
        setIsVideoDrivenPlayback(false);
        return;
      }

      const { sourceSec } = timelineToSourceSeconds(
        currentTimeMs,
        resolvedActiveClip,
        video.duration,
      );
      if (Math.abs(video.currentTime - sourceSec) > 0.08) {
        video.currentTime = sourceSec;
      }

      setIsVideoDrivenPlayback(true);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err?.name === 'AbortError') return;
          console.warn('[EditorViewport] Video play error (browser autoplay policy or media loading):', err);
          setIsPlaying(false);
          setIsVideoDrivenPlayback(false);
        });
      }
      return;
    }

    if (!video || !isVideo || !effectivePreviewUrl) return;

    setIsVideoDrivenPlayback(true);
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (err?.name === 'AbortError') return;
        console.warn('[EditorViewport] Video play error (browser autoplay policy or media loading):', err);
        setIsPlaying(false);
        setIsVideoDrivenPlayback(false);
      });
    }
  }, [
    isPlaying,
    hasAnyPlayableClips,
    timelinePlaybackState.isTimelineEnded,
    timelinePlaybackState.isGap,
    timelinePlaybackState.currentTimeMs,
    resolvedActiveClip?.id,
    isVideo,
    effectivePreviewUrl,
    setCurrentTimeMs,
    setIsPlaying,
    setIsVideoDrivenPlayback,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsVideoDrivenPlayback(false);
    };
  }, [setIsVideoDrivenPlayback]);

  // 3. VIDEO -> TIMELINE SYNCHRONIZATION (HTML5 Video events -> Store)
  const applyClipTimeUpdateResolution = useCallback(
    (
      video: HTMLVideoElement,
      currentClip: any | null,
      videoTimeSec: number,
    ) => {
      const update = resolveVideoClipTimeUpdate(
        playbackInput,
        currentClip,
        videoTimeSec,
        projectDurationMs,
      );

      lastSynchronizedMs.current = update.timelineTimeMs;

      if (update.shouldStopPlayback) {
        activeClipRef.current = null;
        lastActiveClipIdRef.current = null;
        video.pause();
        setIsPlaying(false);
        setIsVideoDrivenPlayback(false);
        setCurrentTimeMs(update.timelineTimeMs);
        return;
      }

      if (update.isGap || !update.shouldDriveWithVideo) {
        activeClipRef.current = null;
        lastActiveClipIdRef.current = null;
        video.pause();
        setIsVideoDrivenPlayback(false);
        setCurrentTimeMs(update.timelineTimeMs);
        return;
      }

      if (update.didSwitchClip && update.activeClip) {
        activeClipRef.current = update.activeClip;
        lastActiveClipIdRef.current = update.activeClip.id;
        setIsVideoDrivenPlayback(true);
        setCurrentTimeMs(update.timelineTimeMs);

        const currentAssetId = (currentClip as any)?.mediaAssetId ?? null;
        const nextAssetId = (update.activeClip as any)?.mediaAssetId ?? null;
        const isSameAsset =
          (!currentAssetId && !nextAssetId) ||
          (currentAssetId !== null && currentAssetId === nextAssetId);

        if (isSameAsset) {
          const targetSec =
            update.sourceTimeSec ??
            timelineToSourceSeconds(update.timelineTimeMs, update.activeClip, video.duration).sourceSec;
          if (Math.abs(video.currentTime - targetSec) > 0.05) {
            video.currentTime = targetSec;
          }
          if (isPlaying) {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch((err) => {
                if (err?.name === 'AbortError') return;
                setIsPlaying(false);
                setIsVideoDrivenPlayback(false);
              });
            }
          }
        }
        return;
      }

      setCurrentTimeMs(update.timelineTimeMs);
    },
    [
      playbackInput,
      projectDurationMs,
      isPlaying,
      setCurrentTimeMs,
      setIsPlaying,
      setIsVideoDrivenPlayback,
    ],
  );

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hasAnyPlayableClips) {
      const currentClip = activeClipRef.current || resolvedActiveClip;
      if (!currentClip) return;
      applyClipTimeUpdateResolution(video, currentClip, video.currentTime);
    } else {
      // Direct media preview: video.currentTime * 1000 is timeline time
      const timeMs = Math.round(video.currentTime * 1000);
      lastSynchronizedMs.current = timeMs;
      setCurrentTimeMs(timeMs);
    }
  }, [hasAnyPlayableClips, resolvedActiveClip, applyClipTimeUpdateResolution, setCurrentTimeMs]);

  const handleEnded = useCallback(() => {
    const video = videoRef.current;
    if (hasAnyPlayableClips && video) {
      const currentClip = activeClipRef.current || resolvedActiveClip;
      if (!currentClip) {
        setIsPlaying(false);
        setIsVideoDrivenPlayback(false);
        return;
      }
      // If handleTimeUpdate already switched to the incoming clip in this render cycle, skip duplicate transition
      if (
        resolvedActiveClip &&
        activeClipRef.current &&
        activeClipRef.current.id !== resolvedActiveClip.id
      ) {
        return;
      }

      const clipDurationMs = Math.max(
        0,
        Number(currentClip.endTimeMs ?? 0) - Number(currentClip.startTimeMs ?? 0),
      );
      const clipEndSourceSec =
        typeof currentClip.sourceEndMs === 'number' && currentClip.sourceEndMs > 0
          ? currentClip.sourceEndMs / 1000
          : (Number(currentClip.sourceStartMs ?? 0) + clipDurationMs) / 1000;

      applyClipTimeUpdateResolution(video, currentClip, clipEndSourceSec);
      return;
    }

    setIsPlaying(false);
    setIsVideoDrivenPlayback(false);
    if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
      setCurrentTimeMs(Math.round(videoRef.current.duration * 1000));
    }
  }, [
    hasAnyPlayableClips,
    resolvedActiveClip,
    applyClipTimeUpdateResolution,
    setCurrentTimeMs,
    setIsPlaying,
    setIsVideoDrivenPlayback,
  ]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    setVideoMetadata({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setIsVideoReady(true);
    setIsVideoBuffering(false);
    setVideoError(null);

    if (isInTimelineGapOrEnd) {
      return;
    }

    // Initial seek to match current playhead
    let targetSourceSec = 0;
    const targetClip = activeClipRef.current || resolvedActiveClip;
    if (targetClip) {
      const sync = timelineToSourceSeconds(currentTimeMs, targetClip, video.duration);
      targetSourceSec = sync.sourceSec;
    } else {
      targetSourceSec = Math.max(0, Math.min(currentTimeMs / 1000, video.duration));
    }
    video.currentTime = targetSourceSec;

    if (isPlaying && (targetClip || !hasAnyPlayableClips)) {
      setIsVideoDrivenPlayback(true);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err?.name === 'AbortError') return;
          setIsPlaying(false);
          setIsVideoDrivenPlayback(false);
        });
      }
    }
  };

  const waveformJob = selectedAsset ? jobs[`${selectedAsset.id}:waveform`] : undefined;
  const activeWaveformData =
    (waveformJob?.waveformData as { sampleCount?: number; samples?: number[] } | undefined) ||
    selectedAsset?.waveformData ||
    null;
  const isWaveformReadyForAsset = selectedAsset ? isDerivativeReady(selectedAsset, 'waveform', jobs) : false;
  const videoElementSrc = effectivePreviewUrl || lastLoadedVideoUrlRef.current;

  return (
    <Surface level={1} className="h-full flex flex-col justify-between overflow-hidden bg-[#080909] relative select-none">
      {/* Viewport Top Bar */}
      <div className="px-4 py-2 border-b border-[#292B2D] flex items-center justify-between text-xs text-zinc-400 shrink-0 bg-[#0B0C0D]">
        <div className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-[#C7C9CC]" />
          <span className="font-semibold text-zinc-300">Canvas Viewport</span>
          <span className="text-[10px] font-mono text-zinc-500">({aspectRatio})</span>
        </div>

        {selectedAsset && !isInTimelineGapOrEnd && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
            {activeTransitionState && (
              <span
                data-testid="viewport-active-transition-badge"
                className="px-1.5 py-0.5 rounded text-[10px] border bg-[#1B1C1E] border-[#3A3C3F] text-[#F2F2F0] capitalize"
              >
                {activeTransitionState.evaluation.type} ({Math.round(activeTransitionState.evaluation.progress * 100)}%)
              </span>
            )}
            {isVideo && effectivePreviewUrl && (
              <span
                data-testid="viewport-preview-source-badge"
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  isProxyStream
                    ? 'bg-[#141F16] border-[#2E5C38] text-[#86EFAC]'
                    : 'bg-[#141516] border-[#292B2D] text-[#C7C9CC]'
                }`}
              >
                {isProxyStream ? '720p Proxy' : 'Original Source'}
              </span>
            )}
            <span className="text-zinc-500">Active Asset:</span>
            <span className="text-[#F2F2F0] truncate max-w-[180px]">{selectedAsset.originalFilename}</span>
          </div>
        )}
      </div>

      {/* Main Viewport Stage Area */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 relative overflow-hidden min-w-0 w-full">
        {/* The Canonical Canvas Boundary Box */}
        <div
          id="editor-canvas-box"
          className={`relative rounded-xl border border-[#3A3C3F] bg-black shadow-[0_12px_48px_rgba(0,0,0,0.85)] flex items-center justify-center overflow-hidden transition-all duration-300 ${getAspectRatioClasses()}`}
        >
          {isLoadingUrl && !isInTimelineGapOrEnd ? (
            <div className="flex flex-col items-center justify-center gap-2 text-xs text-zinc-400 p-4 text-center">
              <RefreshCw className="w-5 h-5 text-[#C7C9CC] animate-spin" />
              <span>Acquiring signed R2 media token...</span>
            </div>
          ) : isInTimelineGapOrEnd || (selectedAsset && effectivePreviewUrl) ? (
            <div className="w-full h-full relative flex items-center justify-center bg-black">
              {isInTimelineGapOrEnd && (
                <div
                  data-testid="viewport-gap-black-frame"
                  data-gap-state={isInTimelineGap ? 'gap' : 'timeline-end'}
                  className="w-full h-full relative flex items-center justify-center bg-black"
                />
              )}
              {isVideo && videoElementSrc ? (
                <>
                  <video
                    ref={videoRef}
                    id="html5-video-player"
                    data-preview-source={isProxyStream ? 'proxy' : 'original'}
                    src={videoElementSrc}
                    preload="auto"
                    playsInline
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    onWaiting={() => setIsVideoBuffering(true)}
                    onPlaying={() => setIsVideoBuffering(false)}
                    onCanPlay={() => setIsVideoBuffering(false)}
                    onError={(e) => {
                      const fallbackUrl =
                        fallbackPreviewUrl || selectedAsset?.originalPreviewUrl || videoPreviewUrl;
                      // If proxy playback fails, gracefully fall back to original media URL
                      if (!usingFallbackOriginal && fallbackUrl && fallbackUrl !== effectivePreviewUrl) {
                        setUsingFallbackOriginal(true);
                        setVideoError(null);
                        return;
                      }
                      console.error('[EditorViewport] Video decode error:', e);
                      setIsVideoBuffering(false);
                      setVideoError('Unable to stream or decode video format in current browser engine.');
                    }}
                    style={clipTransformStyle}
                    className={
                      isInTimelineGapOrEnd
                        ? 'hidden'
                        : 'w-full h-full object-contain origin-center'
                    }
                  />

                  {/* Video Buffering Overlay */}
                  {isVideoBuffering && !isInTimelineGapOrEnd && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-xs z-10 pointer-events-none">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141516]/90 border border-[#292B2D] text-xs text-zinc-300 font-mono">
                        <RefreshCw className="w-3.5 h-3.5 text-[#C7C9CC] animate-spin" />
                        <span>Buffering...</span>
                      </div>
                    </div>
                  )}
                </>
              ) : !isInTimelineGapOrEnd && selectedAsset && isImage ? (
                <img
                  src={effectivePreviewUrl!}
                  alt={selectedAsset.originalFilename}
                  style={clipTransformStyle}
                  className="w-full h-full object-contain origin-center"
                />
              ) : !isInTimelineGapOrEnd && selectedAsset && isAudio ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    {isEffectiveMuted ? (
                      <VolumeX className="w-7 h-7 text-rose-400" />
                    ) : (
                      <Volume2 className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white truncate max-w-[200px]">
                      {selectedAsset.originalFilename}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 font-mono" data-testid="audio-waveform-readiness">
                      {isWaveformReadyForAsset
                        ? `Waveform Ready${activeWaveformData?.sampleCount ? ` (${activeWaveformData.sampleCount} pts)` : ''}`
                        : readiness?.derivatives.waveform.status === 'failed'
                        ? 'Audio Ready (Waveform Fallback)'
                        : readiness?.derivatives.waveform.status === 'processing'
                        ? 'Processing Audio Waveform...'
                        : 'Audio Track Asset'}
                    </div>
                    {resolvedActiveClip && (
                      <div
                        data-testid="audio-preview-effective-volume"
                        className="text-[10px] font-mono text-zinc-300 mt-1"
                      >
                        {isEffectiveMuted
                          ? 'Output: Muted (0%)'
                          : `Output: ${Math.round(effectiveAudioVolume * 100)}%`}
                      </div>
                    )}
                  </div>
                  <audio
                    ref={audioRef}
                    src={effectivePreviewUrl!}
                    controls
                    className="mt-2 w-56 h-8"
                  />
                </div>
              ) : !isInTimelineGapOrEnd ? (
                <div className="text-xs text-zinc-400">Preview unsupported for this file type.</div>
              ) : null}
            </div>
          ) : activeTextClips.length > 0 ? (
            <div className="w-full h-full relative flex items-center justify-center bg-black" />
          ) : (
            /* Empty selection state */
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-zinc-500">
              <Film className="w-8 h-8 text-zinc-600 mb-1 opacity-60" />
              <p className="text-xs font-medium text-zinc-400">No Video Asset Selected</p>
              <p className="text-[11px] text-zinc-600 max-w-[240px] leading-relaxed">
                Add clips to the timeline or select a video from the project media library to preview in the canvas.
              </p>
            </div>
          )}

          {/* Phase 9E: Active Text Clips Overlay Layer (startTimeMs <= currentTimeMs < endTimeMs) */}
          {activeTextClips.length > 0 && (
            <div
              data-testid="canvas-text-overlays-layer"
              className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-15"
            >
              {activeTextClips.map((textClip) => {
                const tp = textClip.textProperties;
                const tStyle = buildClipTransformStyle(textClip.transform);
                return (
                  <div
                    key={textClip.id}
                    data-testid={`canvas-text-overlay-${textClip.id}`}
                    style={{
                      transform: tStyle.transform,
                      opacity: tStyle.opacity,
                      fontSize: `${Math.max(8, Math.round(tp.fontSize * 0.45))}px`,
                      fontWeight: tp.fontWeight as any,
                      color: tp.color,
                      textAlign: tp.textAlign,
                      fontFamily: tp.fontFamily || 'Inter, sans-serif',
                    }}
                    className="px-3 py-1 whitespace-pre-wrap break-words max-w-[90%] drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] leading-tight"
                  >
                    {tp.textContent}
                  </div>
                );
              })}
            </div>
          )}

          {/* Video Error Overlay */}
          {videoError && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center z-20">
              <AlertCircle className="w-6 h-6 text-rose-400 mb-2" />
              <div className="text-xs font-semibold text-white">Playback Error</div>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-[220px]">{videoError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Viewport Bottom Controls Info */}
      <div className="px-4 py-1.5 border-t border-[#1b1f2e] flex items-center justify-between text-[11px] text-zinc-500 shrink-0 bg-[#0a0c12] font-mono">
        <span>Canvas: {aspectRatio === '9:16' ? '1080 x 1920' : aspectRatio === '1:1' ? '1080 x 1080' : '1920 x 1080'}</span>
        <div className="flex items-center gap-3">
          {videoMetadata && (
            <span className="text-zinc-400">
              {videoMetadata.width}x{videoMetadata.height} ({videoMetadata.duration.toFixed(1)}s)
            </span>
          )}
          <span>HTML5 Video Pipeline</span>
        </div>
      </div>
    </Surface>
  );
};
