import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { Surface, Badge, MotionButton } from '@/src/components/ui';
import { useEditorStore } from '../stores/useEditorStore';
import {
  deltaPxToDeltaMs,
  getEffectiveTimelineDurationMs,
  getPixelsPerSecond,
  msToPx,
  pxToMs,
} from '../utils/timelinePrecision';
import { getTrackAdjacentClipPairs } from '../utils/clipTransition';
import type { Timeline as TimelineModel, TimelineTrack, TimelineClip, ClipType } from '@/src/types/timeline';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Film,
  Music,
  Type,
  Subtitles,
  Sparkles,
  Compass,
  Scissors,
  Trash2,
  Magnet,
  ArrowRightLeft,
  Plus,
} from 'lucide-react';

export interface TimelineProps {
  timeline: TimelineModel | null;
  durationMs: number;
  fps: number;
}

export const Timeline: React.FC<TimelineProps> = ({ timeline, durationMs, fps }) => {
  const {
    currentTimeMs,
    isPlaying,
    playbackRate,
    isVideoDrivenPlayback,
    zoomLevel,
    selectedTrackId,
    selectedClipId,
    selectedTransitionId,
    isSnappingEnabled,
    setCurrentTimeMs,
    togglePlayback,
    setPlaybackRate,
    setZoomLevel,
    selectClipAndTrack,
    selectTrack,
    selectTransition,
    toggleSnapping,
    addTextClip,
    addTransition,
    moveClip,
    trimClipStart,
    trimClipEnd,
    splitClip,
    deleteClip,
    initializeDefaultTracks,
  } = useEditorStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    mode: 'move' | 'trim-start' | 'trim-end';
    clipId: string;
    trackId: string;
    initialClientX: number;
    initialStartMs: number;
    initialEndMs: number;
    hasMoved: boolean;
  } | null>(null);

  // 1. Playback timer integration: only ticks if playback is active and NOT currently driven by HTML5 video
  useEffect(() => {
    if (!isPlaying || isVideoDrivenPlayback) return;
    const intervalMs = 1000 / Math.max(10, Math.min(fps || 30, 60));
    const timer = setInterval(() => {
      const store = useEditorStore.getState();
      if (store.isVideoDrivenPlayback) return;
      const current = store.currentTimeMs;
      const maxDuration = getEffectiveTimelineDurationMs(
        store.timeline,
        store.currentProject?.durationMs,
      );

      const next = Math.round(current + intervalMs * (store.playbackRate || 1.0));
      if (next >= maxDuration) {
        store.setCurrentTimeMs(maxDuration);
        store.setIsPlaying(false);
      } else {
        store.setCurrentTimeMs(next);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, isVideoDrivenPlayback, fps, playbackRate]);

  // 2. Computed timeline boundary & scaling via reusable precision helpers
  const effectiveTotalDurationMs = useMemo(() => {
    return getEffectiveTimelineDurationMs(timeline, durationMs);
  }, [durationMs, timeline]);

  const pixelsPerSecond = getPixelsPerSecond(zoomLevel);
  const timelineContentWidthPx = Math.max(800, msToPx(effectiveTotalDurationMs, zoomLevel));

  const timeToPx = useCallback(
    (timeMs: number) => {
      return msToPx(timeMs, zoomLevel);
    },
    [zoomLevel],
  );

  const pxToTime = useCallback(
    (px: number) => {
      return pxToMs(px, zoomLevel, effectiveTotalDurationMs);
    },
    [zoomLevel, effectiveTotalDurationMs],
  );

  // Format millisecond timestamp into HH:MM:SS:FF or MM:SS:SS
  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const f = Math.floor(((ms % 1000) / 1000) * (fps || 30));
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  // 3. Ruler Tick Marks generator
  const rulerTicks = useMemo(() => {
    // Dynamic interval based on zoomLevel to avoid tick crowding
    let stepSec = 1;
    if (pixelsPerSecond < 20) stepSec = 10;
    else if (pixelsPerSecond < 40) stepSec = 5;
    else if (pixelsPerSecond < 80) stepSec = 2;
    else if (pixelsPerSecond < 160) stepSec = 1;
    else stepSec = 0.5;

    const ticks: { timeMs: number; isMajor: boolean; label?: string }[] = [];
    const totalSeconds = effectiveTotalDurationMs / 1000;

    for (let sec = 0; sec <= totalSeconds; sec += stepSec) {
      const timeMs = Math.round(sec * 1000);
      const isMajor = sec % (stepSec * 2 === 1 ? 2 : stepSec * 5) === 0 || sec === 0;
      const min = Math.floor(sec / 60);
      const remainderSec = Math.floor(sec % 60);
      const label = isMajor
        ? `${String(min).padStart(2, '0')}:${String(remainderSec).padStart(2, '0')}`
        : undefined;

      ticks.push({ timeMs, isMajor, label });
    }
    return ticks;
  }, [pixelsPerSecond, effectiveTotalDurationMs]);

  // 4. Playhead scrubber click & drag handlers
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTimeMs = pxToTime(clickX);
    setCurrentTimeMs(newTimeMs);
  };

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rulerEl = e.currentTarget;
    const updateFromClientX = (clientX: number) => {
      const rect = rulerEl.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      setCurrentTimeMs(pxToTime(offsetX));
    };

    updateFromClientX(e.clientX);

    const onMove = (moveEvent: MouseEvent) => {
      updateFromClientX(moveEvent.clientX);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTrackAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only seek if clicking empty track space (not a clip or transition control)
    if (
      (e.target as HTMLElement).closest('[data-timeline-clip]') ||
      (e.target as HTMLElement).closest('[data-timeline-transition]')
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTimeMs = pxToTime(clickX);
    setCurrentTimeMs(newTimeMs);
  };

  // 5. Clip Selection & Drag / Trim Interactions
  const handleClipClick = (e: React.MouseEvent, clip: TimelineClip, trackId: string) => {
    e.stopPropagation();
    selectClipAndTrack(clip.id, trackId);
  };

  const beginClipInteraction = (
    e: React.MouseEvent,
    mode: 'move' | 'trim-start' | 'trim-end',
    clip: TimelineClip,
    trackId: string,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectClipAndTrack(clip.id, trackId);

    dragStateRef.current = {
      mode,
      clipId: clip.id,
      trackId,
      initialClientX: e.clientX,
      initialStartMs: clip.startTimeMs,
      initialEndMs: clip.endTimeMs,
      hasMoved: false,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const deltaPx = moveEvent.clientX - drag.initialClientX;
      if (Math.abs(deltaPx) > 2) {
        drag.hasMoved = true;
      }

      const activeZoom = useEditorStore.getState().zoomLevel;
      const deltaMs = deltaPxToDeltaMs(deltaPx, activeZoom);
      if (drag.mode === 'move') {
        moveClip(drag.clipId, Math.max(0, drag.initialStartMs + deltaMs));
      } else if (drag.mode === 'trim-start') {
        trimClipStart(drag.clipId, drag.initialStartMs + deltaMs);
      } else if (drag.mode === 'trim-end') {
        trimClipEnd(drag.clipId, drag.initialEndMs + deltaMs);
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Determine currently selected clip object and whether playhead can split it
  const selectedClipObj = useMemo(() => {
    if (!selectedClipId || !timeline?.tracks) return null;
    for (const t of timeline.tracks) {
      const found = (t.clips || []).find((c) => c.id === selectedClipId);
      if (found) return found;
    }
    return null;
  }, [selectedClipId, timeline]);

  const canSplitSelectedClip = Boolean(
    selectedClipObj &&
      currentTimeMs > selectedClipObj.startTimeMs + 100 &&
      currentTimeMs < selectedClipObj.endTimeMs - 100,
  );

  // Zoom controls
  const handleZoomIn = () => setZoomLevel(Math.min(300, zoomLevel + 20));
  const handleZoomOut = () => setZoomLevel(Math.max(10, zoomLevel - 20));
  const handleZoomReset = () => setZoomLevel(50);

  // Helper icons and styles for clip types
  const getClipTypeStyle = (type: ClipType, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-[#252628] border-[#C7C9CC] text-white shadow-[0_0_12px_rgba(255,255,255,0.25)] z-20';
    }
    switch (type) {
      case 'video':
        return 'bg-[#171819] border-[#292B2D] text-[#F2F2F0] hover:border-[#686B70]';
      case 'audio':
        return 'bg-emerald-950/80 border-emerald-700/70 text-emerald-100 hover:border-emerald-500';
      case 'text':
        return 'bg-[#1B1C1E] border-[#3A3C3F] text-[#F2F2F0] hover:border-[#92969C]';
      case 'caption':
        return 'bg-[#202123] border-[#3A3C3F] text-[#C7C9CC] hover:border-[#686B70]';
      case 'image':
      default:
        return 'bg-[#141516] border-[#292B2D] text-[#92969C] hover:border-[#686B70]';
    }
  };

  const getClipIcon = (type: ClipType) => {
    switch (type) {
      case 'video':
        return <Film className="w-3 h-3 shrink-0 text-[#C7C9CC]" />;
      case 'audio':
        return <Music className="w-3 h-3 shrink-0 text-emerald-400" />;
      case 'text':
        return <Type className="w-3 h-3 shrink-0 text-[#B4B6B9]" />;
      case 'caption':
        return <Subtitles className="w-3 h-3 shrink-0 text-[#92969C]" />;
      default:
        return <Film className="w-3 h-3 shrink-0 text-[#686B70]" />;
    }
  };

  const getTrackIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Film className="w-3.5 h-3.5 text-[#C7C9CC]" />;
      case 'audio':
        return <Music className="w-3.5 h-3.5 text-emerald-400" />;
      case 'text':
        return <Type className="w-3.5 h-3.5 text-[#B4B6B9]" />;
      case 'caption':
        return <Subtitles className="w-3.5 h-3.5 text-[#92969C]" />;
      case 'overlay':
        return <Layers className="w-3.5 h-3.5 text-indigo-300" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const tracks = timeline?.tracks || [];
  const totalClipsCount = tracks.reduce((sum, t) => sum + (t.clips?.length || 0), 0);

  return (
    <Surface
      level={2}
      id="modify-timeline"
      className="h-52 sm:h-64 border-t border-[#292B2D] flex flex-col justify-between overflow-hidden select-none shrink-0 bg-[#080909] w-full min-w-0"
    >
      {/* 1. TIMELINE HEADER BAR */}
      <div
        id="timeline-header"
        className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-[#292B2D] flex items-center justify-between text-xs text-zinc-400 bg-[#0B0C0D] shrink-0 gap-2 overflow-x-auto scrollbar-none min-w-0"
      >
        {/* Left: Playback & Timecode Display */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Play/Pause Button */}
          <button
            id="timeline-play-btn"
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Pause timeline playback' : 'Play timeline'}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-white to-[#C7C9CC] hover:from-[#F2F2F0] hover:to-white text-[#0B0C0D] flex items-center justify-center transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#C7C9CC] shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          {/* Reset Playhead to 0 */}
          <button
            id="timeline-rewind-btn"
            onClick={() => setCurrentTimeMs(0)}
            aria-label="Rewind playhead to start"
            className="p-1.5 rounded-lg hover:bg-[#202123] text-zinc-400 hover:text-white transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#C7C9CC] shrink-0"
            title="Return to start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Factual Timecode Digital Readout */}
          <div
            id="timeline-timecode"
            className="font-mono text-xs px-2 sm:px-2.5 py-1 rounded bg-[#080909] border border-[#292B2D] text-[#F2F2F0] font-semibold tracking-wider shrink-0"
          >
            {formatTimecode(currentTimeMs)}
            <span className="text-[10px] text-zinc-500 font-normal ml-1 sm:ml-1.5 hidden xs:inline">
              / {formatTimecode(effectiveTotalDurationMs)}
            </span>
          </div>

          {/* Playback Rate Selector */}
          <div className="hidden sm:flex items-center gap-1 bg-[#080909] border border-[#292B2D] rounded p-0.5 font-mono text-[10px] shrink-0">
            {[0.5, 1.0, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-[#252628] text-white font-semibold border border-[#3A3C3F]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={`Set playback speed to ${rate}x`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Phase 9A/9E: Core Timeline Editing Controls (Add Text, Split, Delete, Snap) */}
          <div className="flex items-center gap-1 pl-1 sm:pl-2 border-l border-[#292B2D] shrink-0">
            <button
              id="timeline-add-text-btn"
              data-testid="timeline-add-text-btn"
              type="button"
              disabled={!timeline || tracks.length === 0}
              onClick={() => addTextClip()}
              aria-label="Add text clip to timeline"
              title="Add Text Overlay at Playhead"
              className="px-2 py-1 rounded bg-[#141516] hover:bg-[#252628] border border-[#292B2D] hover:border-[#686B70] text-[#F2F2F0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <Type className="w-3 h-3 text-[#C7C9CC]" />
              <span className="hidden xs:inline">Text</span>
            </button>

            <button
              id="timeline-split-btn"
              data-testid="timeline-split-btn"
              type="button"
              disabled={!canSplitSelectedClip}
              onClick={() => splitClip()}
              aria-label="Split selected clip at playhead"
              title={
                canSplitSelectedClip
                  ? 'Split selected clip at playhead (S)'
                  : 'Select a clip and position playhead inside it to split'
              }
              className="px-2 py-1 rounded bg-[#141516] hover:bg-[#252628] border border-[#292B2D] hover:border-[#686B70] text-[#F2F2F0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <Scissors className="w-3 h-3 text-[#C7C9CC]" />
              <span className="hidden xs:inline">Split</span>
            </button>

            <button
              id="timeline-delete-btn"
              data-testid="timeline-delete-btn"
              type="button"
              disabled={!selectedClipId}
              onClick={() => deleteClip()}
              aria-label="Delete selected clip"
              title={selectedClipId ? 'Delete selected clip (Delete / Backspace)' : 'Select a clip to delete'}
              className="px-2 py-1 rounded bg-[#141516] hover:bg-rose-950/40 border border-[#292B2D] hover:border-rose-800/60 text-zinc-300 hover:text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden xs:inline">Delete</span>
            </button>

            <button
              id="timeline-snap-btn"
              data-testid="timeline-snap-btn"
              type="button"
              onClick={toggleSnapping}
              aria-pressed={isSnappingEnabled}
              aria-label={isSnappingEnabled ? 'Disable timeline snapping' : 'Enable timeline snapping'}
              title={isSnappingEnabled ? 'Snapping enabled (click to disable)' : 'Snapping disabled (click to enable)'}
              className={`px-2 py-1 rounded border flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                isSnappingEnabled
                  ? 'bg-[#252628] border-[#686B70] text-white'
                  : 'bg-[#141516] border-[#292B2D] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Magnet className="w-3 h-3" />
              <span className="hidden sm:inline">Snap</span>
            </button>
          </div>
        </div>

        {/* Center: Workspace Status Badge */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[11px] gap-1.5 border-[#3A3C3F] bg-[#141516] text-[#C7C9CC] font-mono">
            <Layers className="w-3 h-3 text-[#C7C9CC]" />
            <span>
              {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'} • {totalClipsCount} {totalClipsCount === 1 ? 'Clip' : 'Clips'}
            </span>
          </Badge>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141516] text-zinc-500 border border-[#292B2D]">
            {fps} fps
          </span>
        </div>

        {/* Right: Zoom Scale Controls */}
        <div id="timeline-zoom-controls" className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            id="timeline-zoom-out-btn"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 10}
            aria-label="Zoom out timeline scale"
            className="p-1 sm:p-1.5 rounded hover:bg-[#202123] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#C7C9CC]"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span
            id="timeline-zoom-level"
            className="font-mono text-[10px] text-[#C7C9CC] px-1 sm:px-1.5 py-0.5 rounded bg-[#080909] border border-[#292B2D] min-w-[36px] sm:min-w-[42px] text-center"
          >
            {zoomLevel}%
          </span>

          <button
            id="timeline-zoom-in-btn"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 300}
            aria-label="Zoom in timeline scale"
            className="p-1 sm:p-1.5 rounded hover:bg-[#202123] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#C7C9CC]"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            id="timeline-zoom-reset-btn"
            onClick={handleZoomReset}
            aria-label="Reset zoom level to standard scale"
            className="p-1 sm:p-1.5 rounded hover:bg-[#202123] text-zinc-400 hover:text-white transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#C7C9CC]"
            title="Reset zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. TIMELINE MAIN INTERACTIVE REGION: Fixed Track Headers (Left) + Scrollable Canvas (Right) */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* LEFT COLUMN: TRACK HEADERS */}
        <div
          id="timeline-track-headers-column"
          className="w-28 xs:w-36 sm:w-56 shrink-0 border-r border-[#20273a] bg-[#0c0e14] flex flex-col z-20"
        >
          {/* Header spacer aligning with ruler height (28px) */}
          <div className="h-7 border-b border-[#20273a] px-2 sm:px-3 flex items-center justify-between text-[10px] font-mono text-zinc-500 bg-[#07080d]">
            <span className="truncate">TRACK</span>
            <Compass className="w-3 h-3 text-zinc-600 shrink-0" />
          </div>

          {/* List of Track Headers */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {tracks.length === 0 ? (
              <div className="p-2 sm:p-3 text-[11px] text-zinc-500 italic">No tracks</div>
            ) : (
              tracks.map((track) => {
                const isSelected = selectedTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    id={`track-header-${track.id}`}
                    onClick={() => selectTrack(track.id)}
                    className={`h-14 px-2 sm:px-3 border-b border-[#292B2D] flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1B1C1E] border-l-2 border-l-[#C7C9CC] text-white'
                        : 'bg-[#0B0C0D] hover:bg-[#141516] text-[#92969C]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <div className="shrink-0">{getTrackIcon(track.trackType)}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate text-zinc-200" title={track.name}>
                          {track.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 capitalize truncate">
                          {track.trackType}
                        </div>
                      </div>
                    </div>

                    {/* Quick status indicators */}
                    <div className="flex items-center gap-1 shrink-0 text-zinc-500">
                      {track.isMuted && <VolumeX className="w-3 h-3 text-rose-400" title="Muted" />}
                      {track.isLocked && <Lock className="w-3 h-3 text-amber-400" title="Locked" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SCROLLABLE RULER & TRACK CHANNELS */}
        <div
          ref={scrollContainerRef}
          id="timeline-scroll-container"
          className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden flex flex-col relative bg-[#07080d]"
        >
          {/* Scrollable Container Content Sized to Duration * Zoom */}
          <div
            id="timeline-content-stage"
            className="relative flex flex-col h-full"
            style={{ width: `${timelineContentWidthPx}px`, minWidth: '100%' }}
          >
            {/* A. TIME RULER (Top 28px) */}
            <div
              id="timeline-ruler"
              onClick={handleRulerClick}
              onMouseDown={handleRulerMouseDown}
              role="slider"
              aria-label="Timeline time ruler scrubber"
              aria-valuemin={0}
              aria-valuemax={effectiveTotalDurationMs}
              aria-valuenow={currentTimeMs}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setCurrentTimeMs(currentTimeMs + 1000);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setCurrentTimeMs(currentTimeMs - 1000);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  setCurrentTimeMs(0);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  setCurrentTimeMs(effectiveTotalDurationMs);
                }
              }}
              className="h-7 border-b border-[#292B2D] bg-[#0B0C0D] relative cursor-pointer select-none focus:outline-hidden focus:ring-1 focus:ring-[#C7C9CC]"
            >
              {/* Tick Marks */}
              {rulerTicks.map((tick, i) => {
                const leftPx = timeToPx(tick.timeMs);
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${leftPx}px` }}
                  >
                    <div
                      className={`w-px ${
                        tick.isMajor ? 'h-3.5 bg-[#3A3C3F]' : 'h-1.5 bg-[#292B2D]'
                      }`}
                    />
                    {tick.label && (
                      <span className="absolute top-3 left-1 text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                        {tick.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* B. TRACK LANES AREA (Where clips sit) */}
            <div
              id="timeline-tracks-area"
              onClick={handleTrackAreaClick}
              className="flex-1 flex flex-col relative"
            >
              {tracks.length === 0 ? (
                /* EMPTY STATE: No Tracks Created */
                <div
                  id="timeline-empty-state"
                  className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500"
                >
                  <Layers className="w-7 h-7 text-zinc-600 mb-2 opacity-60" />
                  <p className="text-xs font-semibold text-zinc-400">Timeline Is Empty</p>
                  <p className="text-[11px] text-zinc-500 max-w-sm mt-0.5 leading-relaxed">
                    This project does not contain any active tracks or clips yet.
                  </p>
                  <button
                    type="button"
                    id="timeline-init-tracks-btn"
                    data-testid="timeline-init-tracks-btn"
                    onClick={initializeDefaultTracks}
                    className="mt-3 px-3 py-1.5 rounded bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] hover:border-[#C7C9CC] text-xs font-medium text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Initialize Tracks</span>
                  </button>
                </div>
              ) : (
                /* RENDER REAL TRACKS & CLIPS */
                tracks.map((track) => {
                  const isTrackSelected = selectedTrackId === track.id;
                  const trackClips = track.clips || [];
                  const adjacentPairs = getTrackAdjacentClipPairs(track, timeline);

                  return (
                    <div
                      key={track.id}
                      id={`track-lane-${track.id}`}
                      data-track-id={track.id}
                      className={`h-14 border-b border-[#292B2D] relative flex items-center transition-colors ${
                        isTrackSelected ? 'bg-[#141516]' : 'bg-[#080909] hover:bg-[#0B0C0D]'
                      }`}
                    >
                      {/* Empty track indication if track has no clips */}
                      {trackClips.length === 0 && (
                        <div className="absolute inset-0 flex items-center px-4 text-[11px] text-zinc-600 italic pointer-events-none">
                          No clips on {track.name}
                        </div>
                      )}

                      {/* Clips on this track */}
                      {trackClips.map((clip) => {
                        const isClipSelected = selectedClipId === clip.id;
                        const leftPx = timeToPx(clip.startTimeMs);
                        const durationMs = Math.max(100, clip.endTimeMs - clip.startTimeMs);
                        const widthPx = Math.max(24, timeToPx(durationMs));

                        return (
                          <div
                            key={clip.id}
                            id={`clip-${clip.id}`}
                            data-timeline-clip="true"
                            data-clip-id={clip.id}
                            onClick={(e) => handleClipClick(e, clip, track.id)}
                            onMouseDown={(e) => beginClipInteraction(e, 'move', clip, track.id)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Clip ${clip.name}, duration ${(durationMs / 1000).toFixed(1)} seconds`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                selectClipAndTrack(clip.id, track.id);
                              }
                            }}
                            className={`group absolute h-10 top-2 rounded-md border text-xs px-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all duration-150 select-none overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-[#C7C9CC] ${getClipTypeStyle(
                              clip.clipType,
                              isClipSelected
                            )}`}
                            style={{
                              left: `${leftPx}px`,
                              width: `${widthPx}px`,
                            }}
                          >
                            {/* Left Trim Handle */}
                            <div
                              data-testid={`trim-start-handle-${clip.id}`}
                              title="Drag to trim clip start"
                              onMouseDown={(e) => beginClipInteraction(e, 'trim-start', clip, track.id)}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute inset-y-0 left-0 w-2 cursor-ew-resize z-30 flex items-center justify-center transition-colors ${
                                isClipSelected
                                  ? 'bg-[#C7C9CC]/50 hover:bg-[#F2F2F0]'
                                  : 'bg-transparent group-hover:bg-[#686B70]/40 hover:!bg-[#C7C9CC]'
                              }`}
                            />

                            {/* Clip Type Icon */}
                            {getClipIcon(clip.clipType)}

                            {/* Clip Name */}
                            <div className="flex-1 min-w-0 truncate font-medium tracking-tight text-[11px]">
                              {clip.name}
                            </div>

                            {/* Clip Duration Pill */}
                            <span className="text-[9px] font-mono opacity-70 shrink-0 hidden sm:inline">
                              {(durationMs / 1000).toFixed(1)}s
                            </span>

                            {/* Right Trim Handle */}
                            <div
                              data-testid={`trim-end-handle-${clip.id}`}
                              title="Drag to trim clip end"
                              onMouseDown={(e) => beginClipInteraction(e, 'trim-end', clip, track.id)}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute inset-y-0 right-0 w-2 cursor-ew-resize z-30 flex items-center justify-center transition-colors ${
                                isClipSelected
                                  ? 'bg-[#C7C9CC]/50 hover:bg-[#F2F2F0]'
                                  : 'bg-transparent group-hover:bg-[#686B70]/40 hover:!bg-[#C7C9CC]'
                              }`}
                            />
                          </div>
                        );
                      })}

                      {/* Phase 9G: Adjacent Clip Transition Indicators & Add Buttons */}
                      {adjacentPairs.map((pair) => {
                        const boundaryLeftPx = timeToPx(pair.boundaryMs);
                        const existingTr = pair.transition;
                        const isTransitionSelected =
                          existingTr && selectedTransitionId === existingTr.id;

                        if (existingTr) {
                          return (
                            <button
                              key={`tr-${existingTr.id}`}
                              type="button"
                              data-timeline-transition="true"
                              data-testid={`timeline-transition-${existingTr.id}`}
                              data-transition-pair={`${pair.fromClip.id}-${pair.toClip.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectTransition(existingTr.id);
                              }}
                              title={`Transition: ${existingTr.type} (${existingTr.durationMs}ms)`}
                              style={{
                                left: `${boundaryLeftPx}px`,
                                transform: 'translateX(-50%)',
                              }}
                              className={`absolute top-3.5 h-7 px-1.5 rounded border text-[9px] font-mono flex items-center gap-1 z-35 transition-colors cursor-pointer ${
                                isTransitionSelected
                                  ? 'bg-[#F2F2F0] border-white text-[#080909] font-bold shadow-[0_0_10px_rgba(255,255,255,0.35)]'
                                  : 'bg-[#1B1C1E] border-[#686B70] text-[#F2F2F0] hover:bg-[#252628] hover:border-[#C7C9CC]'
                              }`}
                            >
                              <ArrowRightLeft className="w-2.5 h-2.5 shrink-0" />
                              <span className="uppercase">
                                {existingTr.type === 'cut' ? 'Cut' : 'Fade'}
                              </span>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={`add-tr-${pair.fromClip.id}-${pair.toClip.id}`}
                            type="button"
                            data-timeline-transition="true"
                            data-testid={`timeline-add-transition-${pair.fromClip.id}-${pair.toClip.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              addTransition({
                                fromClipId: pair.fromClip.id,
                                toClipId: pair.toClip.id,
                                type: 'crossfade',
                              });
                            }}
                            title={`Add transition between ${pair.fromClip.name} and ${pair.toClip.name}`}
                            style={{
                              left: `${boundaryLeftPx}px`,
                              transform: 'translateX(-50%)',
                            }}
                            className="absolute top-4 w-5 h-5 rounded-full bg-[#141516] hover:bg-[#252628] border border-[#3A3C3F] hover:border-[#C7C9CC] text-[#C7C9CC] hover:text-white flex items-center justify-center z-35 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* C. THE FUNCTIONAL PLAYHEAD */}
            <div
              ref={playheadRef}
              id="timeline-playhead"
              className="absolute top-0 bottom-0 pointer-events-none z-30 flex flex-col items-center transition-[left] duration-75"
              style={{
                left: `${timeToPx(currentTimeMs)}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Playhead Scrubber Handle Icon */}
              <div className="w-3 h-3.5 bg-rose-500 rounded-b-xs shadow-[0_0_8px_rgba(244,63,94,0.9)] flex items-center justify-center">
                <div className="w-0.5 h-1.5 bg-white/90 rounded-full" />
              </div>
              {/* Vertical Playhead Needle Line spanning ruler and all tracks */}
              <div className="w-[1.5px] flex-1 bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. TIMELINE FOOTER BAR */}
      <div
        id="timeline-footer"
        className="h-6 border-t border-[#1f2637] bg-[#07080d] flex items-center px-4 justify-between text-[10px] font-mono text-zinc-500 shrink-0"
      >
        <div className="flex items-center gap-3">
          <span className="text-[#C7C9CC]">Clipper Timeline Engine</span>
          <span>•</span>
          <span className="text-zinc-500">
            Selected Track: {selectedTrackId ? tracks.find((t) => t.id === selectedTrackId)?.name || 'None' : 'None'}
          </span>
          <span>•</span>
          <span className="text-zinc-500">
            Selected Clip: {selectedClipId || 'None'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>Click ruler or track to scrub</span>
          <span>•</span>
          <span className="text-[#C7C9CC]">Phase 6B</span>
        </div>
      </div>
    </Surface>
  );
};
