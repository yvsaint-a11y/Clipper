import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';
import type { Timeline, TimelineTrack, TimelineClip } from '../src/types/timeline';

describe('Phase 6B: Timeline Foundation & Clip Selection', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  const mockTimeline: Timeline = {
    id: 'timeline-001',
    projectId: 'proj-001',
    totalDurationMs: 30000,
    updatedAt: new Date().toISOString(),
    tracks: [
      {
        id: 'track-v1',
        timelineId: 'timeline-001',
        name: 'Video Main',
        trackType: 'video',
        orderIndex: 0,
        isMuted: false,
        isLocked: false,
        volume: 1,
        clips: [
          {
            id: 'clip-v1-1',
            trackId: 'track-v1',
            name: 'Intro Hook.mp4',
            clipType: 'video',
            mediaAssetId: 'asset-01',
            startTimeMs: 0,
            endTimeMs: 5000,
            sourceStartMs: 0,
            sourceEndMs: 5000,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
          },
          {
            id: 'clip-v1-2',
            trackId: 'track-v1',
            name: 'Main Content.mp4',
            clipType: 'video',
            mediaAssetId: 'asset-02',
            startTimeMs: 5000,
            endTimeMs: 15000,
            sourceStartMs: 0,
            sourceEndMs: 10000,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
          },
        ],
      },
      {
        id: 'track-a1',
        timelineId: 'timeline-001',
        name: 'Background Music',
        trackType: 'audio',
        orderIndex: 1,
        isMuted: false,
        isLocked: false,
        volume: 0.8,
        clips: [
          {
            id: 'clip-a1-1',
            trackId: 'track-a1',
            name: 'Upbeat Synth.mp3',
            clipType: 'audio',
            mediaAssetId: 'asset-03',
            startTimeMs: 0,
            endTimeMs: 20000,
            sourceStartMs: 0,
            sourceEndMs: 20000,
            audioProperties: { volume: 0.8, fadeInMs: 500, fadeOutMs: 500, muted: false },
          },
        ],
      },
    ],
  };

  it('correctly mounts project and timeline into editor store', () => {
    const mockProject = {
      id: 'proj-001',
      name: 'Commercial Reel',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 30000,
    };

    useEditorStore.getState().setProject(mockProject, mockTimeline);
    const state = useEditorStore.getState();

    expect(state.currentProject).toEqual(mockProject);
    expect(state.timeline).toEqual(mockTimeline);
    expect(state.timeline?.tracks.length).toBe(2);
    expect(state.timeline?.tracks[0].clips.length).toBe(2);
    expect(state.timeline?.tracks[1].clips.length).toBe(1);
    expect(state.currentTimeMs).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('handles playhead time scrubbing and clamps within valid range', () => {
    useEditorStore.getState().setProject(
      { id: 'proj-001', durationMs: 30000 },
      mockTimeline
    );

    // Normal seek
    useEditorStore.getState().setCurrentTimeMs(8500);
    expect(useEditorStore.getState().currentTimeMs).toBe(8500);

    // Negative clamp to 0
    useEditorStore.getState().setCurrentTimeMs(-500);
    expect(useEditorStore.getState().currentTimeMs).toBe(0);

    // Upper boundary clamp
    useEditorStore.getState().setCurrentTimeMs(45000);
    expect(useEditorStore.getState().currentTimeMs).toBe(30000);
  });

  it('handles playback toggling and state updates', () => {
    expect(useEditorStore.getState().isPlaying).toBe(false);

    useEditorStore.getState().togglePlayback();
    expect(useEditorStore.getState().isPlaying).toBe(true);

    useEditorStore.getState().setIsPlaying(false);
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it('manages clip and track selection state in synchronization', () => {
    useEditorStore.getState().setProject(
      { id: 'proj-001', durationMs: 30000 },
      mockTimeline
    );

    // Initial state
    expect(useEditorStore.getState().selectedClipId).toBeNull();
    expect(useEditorStore.getState().selectedTrackId).toBeNull();

    // Select track
    useEditorStore.getState().selectTrack('track-v1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-v1');

    // Select clip on track
    useEditorStore.getState().selectClipAndTrack('clip-v1-1', 'track-v1');
    expect(useEditorStore.getState().selectedClipId).toBe('clip-v1-1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-v1');

    // Select another clip on another track
    useEditorStore.getState().selectClipAndTrack('clip-a1-1', 'track-a1');
    expect(useEditorStore.getState().selectedClipId).toBe('clip-a1-1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-a1');

    // Deselect clip
    useEditorStore.getState().selectClip(null);
    expect(useEditorStore.getState().selectedClipId).toBeNull();
  });

  it('manages zoom level scaling bounds', () => {
    expect(useEditorStore.getState().zoomLevel).toBe(50);

    useEditorStore.getState().setZoomLevel(120);
    expect(useEditorStore.getState().zoomLevel).toBe(120);

    // Minimum boundary clamp (10%)
    useEditorStore.getState().setZoomLevel(2);
    expect(useEditorStore.getState().zoomLevel).toBe(10);

    // Maximum boundary clamp (300%)
    useEditorStore.getState().setZoomLevel(500);
    expect(useEditorStore.getState().zoomLevel).toBe(300);
  });

  it('supports snapping toggle', () => {
    expect(useEditorStore.getState().isSnappingEnabled).toBe(true);
    useEditorStore.getState().toggleSnapping();
    expect(useEditorStore.getState().isSnappingEnabled).toBe(false);
    useEditorStore.getState().toggleSnapping();
    expect(useEditorStore.getState().isSnappingEnabled).toBe(true);
  });
});
