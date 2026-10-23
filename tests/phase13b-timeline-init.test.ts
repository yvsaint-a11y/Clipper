import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';
import { createDefaultTimelineTracks, DEFAULT_TIMELINE_TRACK_DEFINITIONS } from '../src/types/timeline';
import { DEFAULT_PROJECT_TRACKS } from '../server/routes/projects';
import type { Timeline } from '../src/types/timeline';

describe('Phase 13B.1: Timeline Track Initialization & Empty Timeline Repair', () => {
  const app = createExpressApp();

  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  describe('1. Canonical Shared Timeline Default Tracks', () => {
    it('defines exactly four standard tracks in canonical order', () => {
      expect(DEFAULT_TIMELINE_TRACK_DEFINITIONS).toHaveLength(4);
      expect(DEFAULT_TIMELINE_TRACK_DEFINITIONS.map((t) => t.type)).toEqual([
        'video',
        'overlay',
        'text',
        'audio',
      ]);
      expect(DEFAULT_TIMELINE_TRACK_DEFINITIONS.map((t) => t.name)).toEqual([
        'Main Video',
        'Visual Overlay',
        'Text Overlay',
        'Audio',
      ]);
      expect(DEFAULT_TIMELINE_TRACK_DEFINITIONS.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    });

    it('creates fully structured TimelineTrack instances with empty clips', () => {
      const tracks = createDefaultTimelineTracks('timeline-test-1');
      expect(tracks).toHaveLength(4);

      expect(tracks[0]).toMatchObject({
        timelineId: 'timeline-test-1',
        name: 'Main Video',
        trackType: 'video',
        orderIndex: 0,
        isMuted: false,
        isLocked: false,
        volume: 1,
        clips: [],
      });

      expect(tracks[1]).toMatchObject({
        timelineId: 'timeline-test-1',
        name: 'Visual Overlay',
        trackType: 'overlay',
        orderIndex: 1,
        isMuted: false,
        isLocked: false,
        volume: 1,
        clips: [],
      });

      expect(tracks[2]).toMatchObject({
        timelineId: 'timeline-test-1',
        name: 'Text Overlay',
        trackType: 'text',
        orderIndex: 2,
        isMuted: false,
        isLocked: false,
        volume: 1,
        clips: [],
      });

      expect(tracks[3]).toMatchObject({
        timelineId: 'timeline-test-1',
        name: 'Audio',
        trackType: 'audio',
        orderIndex: 3,
        isMuted: false,
        isLocked: false,
        volume: 1,
        clips: [],
      });
    });

    it('matches server DEFAULT_PROJECT_TRACKS schema specifications', () => {
      expect(DEFAULT_PROJECT_TRACKS).toHaveLength(4);
      expect(DEFAULT_PROJECT_TRACKS.map((t) => t.type)).toEqual([
        'video',
        'overlay',
        'text',
        'audio',
      ]);
      expect(DEFAULT_PROJECT_TRACKS.map((t) => t.name)).toEqual([
        'Main Video',
        'Visual Overlay',
        'Text Overlay',
        'Audio',
      ]);
      expect(DEFAULT_PROJECT_TRACKS.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    });
  });

  describe('2. Client Store Timeline Initialization & Fallback', () => {
    const mockProject = {
      id: 'proj-init-1',
      name: 'Freshly Created Project',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 0,
    };

    it('automatically populates default tracks when mounting a timeline without tracks', () => {
      const uninitTimeline = {
        id: 'timeline-uninit-1',
        projectId: 'proj-init-1',
        totalDurationMs: 0,
        updatedAt: new Date().toISOString(),
      };

      useEditorStore.getState().setProject(mockProject, uninitTimeline as any);
      const state = useEditorStore.getState();

      expect(state.timeline).not.toBeNull();
      expect(state.timeline?.tracks).toHaveLength(4);
      expect(state.timeline?.tracks.map((t) => t.trackType)).toEqual([
        'video',
        'overlay',
        'text',
        'audio',
      ]);
      expect(state.timeline?.tracks.map((t) => t.name)).toEqual([
        'Main Video',
        'Visual Overlay',
        'Text Overlay',
        'Audio',
      ]);
    });

    it('preserves existing populated tracks without overwriting or duplicating', () => {
      const populatedTimeline: Timeline = {
        id: 'timeline-pop-1',
        projectId: 'proj-init-1',
        totalDurationMs: 10000,
        tracks: [
          {
            id: 'custom-video-track',
            timelineId: 'timeline-pop-1',
            name: 'Custom Angle 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 0.9,
            clips: [
              {
                id: 'clip-c1',
                trackId: 'custom-video-track',
                name: 'Angle1.mp4',
                clipType: 'video',
                startTimeMs: 0,
                endTimeMs: 5000,
                sourceStartMs: 0,
                sourceEndMs: 5000,
                mediaAssetId: 'asset-01',
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              },
            ],
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      useEditorStore.getState().setProject(mockProject, populatedTimeline);
      const state = useEditorStore.getState();

      expect(state.timeline?.tracks).toHaveLength(1);
      expect(state.timeline?.tracks[0].id).toBe('custom-video-track');
      expect(state.timeline?.tracks[0].clips).toHaveLength(1);
      expect(state.timeline?.tracks[0].clips[0].name).toBe('Angle1.mp4');
    });

    it('initializeDefaultTracks explicitly creates standard tracks if tracks array is empty', () => {
      useEditorStore.getState().setProject(mockProject, {
        id: 'timeline-empty-2',
        projectId: 'proj-init-1',
        totalDurationMs: 0,
        tracks: [],
        updatedAt: new Date().toISOString(),
      });

      // Clear tracks manually to simulate empty state
      useEditorStore.setState((s) => {
        if (s.timeline) s.timeline.tracks = [];
      });
      expect(useEditorStore.getState().timeline?.tracks).toHaveLength(0);

      // Now call initializeDefaultTracks
      useEditorStore.getState().initializeDefaultTracks();
      const state = useEditorStore.getState();

      expect(state.timeline?.tracks).toHaveLength(4);
      expect(state.timeline?.tracks[0].trackType).toBe('video');
      expect(state.timeline?.tracks[1].trackType).toBe('overlay');
      expect(state.timeline?.tracks[2].trackType).toBe('text');
      expect(state.timeline?.tracks[3].trackType).toBe('audio');
    });
  });

  describe('3. Media-to-Timeline Adding On Newly Initialized Tracks', () => {
    const mockProject = {
      id: 'proj-add-1',
      name: 'Media Test Project',
      aspectRatio: '16:9',
      fps: 30,
      durationMs: 0,
    };

    it('allows adding video clips directly to the initialized Main Video track', () => {
      useEditorStore.getState().setProject(mockProject, {
        id: 'timeline-add-1',
        projectId: 'proj-add-1',
        totalDurationMs: 0,
        updatedAt: new Date().toISOString(),
      } as any);

      const state = useEditorStore.getState();
      const videoTrack = state.timeline?.tracks.find((t) => t.trackType === 'video');
      expect(videoTrack).toBeDefined();

      useEditorStore.getState().addClipToTrack(videoTrack!.id, {
        name: 'Intro.mp4',
        clipType: 'video',
        mediaAssetId: 'media-vid-1',
        startTimeMs: 0,
        endTimeMs: 5000,
        sourceStartMs: 0,
        sourceEndMs: 5000,
      });

      const updatedState = useEditorStore.getState();
      const updatedVideoTrack = updatedState.timeline?.tracks.find((t) => t.id === videoTrack!.id);
      expect(updatedVideoTrack?.clips).toHaveLength(1);
      expect(updatedVideoTrack?.clips[0].name).toBe('Intro.mp4');
      expect(updatedVideoTrack?.clips[0].clipType).toBe('video');
      expect(updatedVideoTrack?.clips[0].endTimeMs).toBe(5000);
    });

    it('allows adding audio clips directly to the initialized Audio track', () => {
      useEditorStore.getState().setProject(mockProject, {
        id: 'timeline-add-2',
        projectId: 'proj-add-1',
        totalDurationMs: 0,
        updatedAt: new Date().toISOString(),
      } as any);

      const state = useEditorStore.getState();
      const audioTrack = state.timeline?.tracks.find((t) => t.trackType === 'audio');
      expect(audioTrack).toBeDefined();

      useEditorStore.getState().addClipToTrack(audioTrack!.id, {
        name: 'Voiceover.mp3',
        clipType: 'audio',
        mediaAssetId: 'media-aud-1',
        startTimeMs: 0,
        endTimeMs: 12000,
        sourceStartMs: 0,
        sourceEndMs: 12000,
      });

      const updatedState = useEditorStore.getState();
      const updatedAudioTrack = updatedState.timeline?.tracks.find((t) => t.id === audioTrack!.id);
      expect(updatedAudioTrack?.clips).toHaveLength(1);
      expect(updatedAudioTrack?.clips[0].name).toBe('Voiceover.mp3');
      expect(updatedAudioTrack?.clips[0].clipType).toBe('audio');
    });

    it('allows adding text clips to the initialized Text Overlay track', () => {
      useEditorStore.getState().setProject(mockProject, {
        id: 'timeline-add-3',
        projectId: 'proj-add-1',
        totalDurationMs: 0,
        updatedAt: new Date().toISOString(),
      } as any);

      const clipId = useEditorStore.getState().addTextClip({
        textContent: 'Breaking News',
      });

      expect(clipId).toBeTruthy();
      const state = useEditorStore.getState();
      const textTrack = state.timeline?.tracks.find((t) => t.trackType === 'text');
      expect(textTrack?.clips).toHaveLength(1);
      expect(textTrack?.clips[0].id).toBe(clipId);
    });
  });

  describe('4. Security & API Enforcement', () => {
    it('requires authentication for project creation', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Unauth Project', aspectRatio: '16:9' });
      expect(res.status).toBe(401);
    });

    it('requires authentication for project retrieval and self-healing', async () => {
      const res = await request(app).get('/api/projects/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });
  });
});
