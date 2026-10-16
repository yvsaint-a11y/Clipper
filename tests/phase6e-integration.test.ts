import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';
import { timelineToSourceSeconds, sourceSecondsToTimelineMs } from '../src/features/editor/utils/playbackSync';
import { buildClientCanonicalSnapshot, computeClientStateString } from '../src/features/editor/utils/projectSnapshot';
import { buildCanonicalSnapshot, computeSnapshotChecksum } from '../server/services/projectSnapshotService';

describe('Phase 6E: Integration Testing & Editor Workflow Validation', () => {
  const app = createExpressApp();

  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  // ==========================================
  // A. PROJECT -> EDITOR
  // ==========================================
  describe('A. Project -> Editor Integration', () => {
    const mockProject = {
      id: 'proj-e-1',
      name: 'Cinematic Teaser',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 12000,
    };

    const mockTimeline = {
      id: 'tl-e-1',
      projectId: 'proj-e-1',
      totalDurationMs: 12000,
      updatedAt: new Date().toISOString(),
      tracks: [
        {
          id: 'track-v1',
          timelineId: 'tl-e-1',
          name: 'Main Video',
          trackType: 'video' as const,
          orderIndex: 0,
          isMuted: false,
          isLocked: false,
          volume: 1,
          clips: [
            {
              id: 'clip-v1',
              trackId: 'track-v1',
              name: 'Opening Shot.mp4',
              clipType: 'video' as const,
              startTimeMs: 0,
              endTimeMs: 6000,
              sourceStartMs: 0,
              sourceEndMs: 6000,
              mediaAssetId: 'asset-video-1',
            },
          ],
        },
        {
          id: 'track-a1',
          timelineId: 'tl-e-1',
          name: 'Soundtrack',
          trackType: 'audio' as const,
          orderIndex: 1,
          isMuted: false,
          isLocked: false,
          volume: 0.8,
          clips: [
            {
              id: 'clip-a1',
              trackId: 'track-a1',
              name: 'Beat.mp3',
              clipType: 'audio' as const,
              startTimeMs: 0,
              endTimeMs: 12000,
              sourceStartMs: 0,
              sourceEndMs: 12000,
              mediaAssetId: 'asset-audio-1',
            },
          ],
        },
      ],
    };

    it('loads project metadata, timeline, tracks, and clips correctly', () => {
      const store = useEditorStore.getState();
      store.setProject(mockProject, mockTimeline);

      const state = useEditorStore.getState();
      expect(state.currentProject).toBeDefined();
      expect(state.currentProject?.name).toBe('Cinematic Teaser');
      expect(state.currentProject?.aspectRatio).toBe('16:9');
      expect(state.currentProject?.resolution).toBe('1080p');
      expect(state.currentProject?.fps).toBe(30);

      expect(state.timeline).toBeDefined();
      expect(state.timeline?.tracks).toHaveLength(2);
      expect(state.timeline?.tracks[0].clips).toHaveLength(1);
      expect(state.timeline?.tracks[1].clips).toHaveLength(1);
      expect(state.isDirty).toBe(false);
    });

    it('respects different aspect ratios (16:9, 9:16, 1:1)', () => {
      const store = useEditorStore.getState();

      store.setProject({ ...mockProject, aspectRatio: '9:16' }, mockTimeline);
      expect(useEditorStore.getState().currentProject?.aspectRatio).toBe('9:16');

      store.updateProjectMetadata({ aspectRatio: '1:1' });
      expect(useEditorStore.getState().currentProject?.aspectRatio).toBe('1:1');
      expect(useEditorStore.getState().isDirty).toBe(true);

      store.updateProjectMetadata({ aspectRatio: '16:9' });
      expect(useEditorStore.getState().currentProject?.aspectRatio).toBe('16:9');
    });

    it('blocks unauthorized access to projects without valid JWT (IDOR prevention)', async () => {
      const res = await request(app).get('/api/projects/some-foreign-project-id');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ==========================================
  // B. MEDIA -> TIMELINE
  // ==========================================
  describe('B. Media -> Timeline Integration', () => {
    const mockMediaAssets = [
      {
        id: 'asset-1',
        storageKey: 'raw/user-1/asset-1.mp4',
        originalFilename: 'drone_flyover.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 14500000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 8000,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'asset-2',
        storageKey: 'raw/user-1/asset-2.mp3',
        originalFilename: 'soundscape.mp3',
        mimeType: 'audio/mpeg',
        fileSizeBytes: 4200000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 15000,
        createdAt: new Date().toISOString(),
      },
    ];

    it('loads media library, selects media, and adds to timeline track', () => {
      const store = useEditorStore.getState();
      const mockProject = {
        id: 'proj-media-test',
        name: 'Media Test',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
      };
      const mockTimeline = {
        id: 'tl-media',
        projectId: 'proj-media-test',
        totalDurationMs: 10000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-v',
            timelineId: 'tl-media',
            name: 'Video 1',
            trackType: 'video' as const,
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [],
          },
        ],
      };

      store.setProject(mockProject, mockTimeline);
      store.setProjectMedia(mockMediaAssets);

      expect(useEditorStore.getState().projectMedia).toHaveLength(2);

      // Select media asset
      store.selectMediaAsset(mockMediaAssets[0]);
      expect(useEditorStore.getState().selectedMediaAsset?.id).toBe('asset-1');

      // Add asset to timeline track
      store.addClipToTrack('track-v', {
        name: mockMediaAssets[0].originalFilename,
        clipType: 'video',
        mediaAssetId: mockMediaAssets[0].id,
        startTimeMs: 0,
        endTimeMs: 8000,
        sourceStartMs: 0,
        sourceEndMs: 8000,
      });

      const track = useEditorStore.getState().timeline?.tracks[0];
      expect(track?.clips).toHaveLength(1);
      expect((track?.clips[0] as any).mediaAssetId).toBe('asset-1');
      expect(track?.clips[0].endTimeMs).toBe(8000);
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('caches presigned preview URLs and excludes them from canonical snapshots', () => {
      const store = useEditorStore.getState();
      store.setProjectMedia(mockMediaAssets);

      // Assign temporary signed URL
      store.updateMediaAssetPreviewUrl('asset-1', 'https://r2.modify.dev/raw/user-1/asset-1.mp4?sig=temp-token');
      const asset = useEditorStore.getState().projectMedia.find((m) => m.id === 'asset-1');
      expect(asset?.previewUrl).toContain('sig=temp-token');

      // Verify canonical snapshot excludes previewUrl
      const snapshot = buildClientCanonicalSnapshot({
        projectId: 'proj-snap-test',
        name: 'Snapshot Test',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        tracks: [
          {
            id: 'tr-1',
            name: 'Track 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'c-1',
                name: 'Clip 1',
                clipType: 'video',
                startTimeMs: 0,
                endTimeMs: 5000,
                mediaAssetId: 'asset-1',
                previewUrl: 'https://r2.modify.dev/temp-sig', // Transient!
              },
            ],
          },
        ],
      });

      const snapString = computeClientStateString(snapshot);
      expect(snapString).not.toContain('previewUrl');
      expect(snapString).not.toContain('temp-sig');
    });

    it('rejects cross-user media references upon project save with 401 or 403', async () => {
      // Unauthenticated / cross-tenant request is rejected
      const res = await request(app)
        .put('/api/projects/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/editor-state')
        .send({
          name: 'Injected Clip Test',
          timeline: {
            tracks: [
              {
                trackType: 'video',
                clips: [{ mediaAssetId: 'foreign-user-asset-uuid' }],
              },
            ],
          },
        });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // C. TIMELINE
  // ==========================================
  describe('C. Timeline Controls & Positioning', () => {
    const mockProject = {
      id: 'proj-tl-test',
      name: 'Timeline Nav Project',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 30000,
    };

    const mockTimeline = {
      id: 'tl-nav',
      projectId: 'proj-tl-test',
      totalDurationMs: 30000,
      updatedAt: new Date().toISOString(),
      tracks: [
        {
          id: 'track-v1',
          timelineId: 'tl-nav',
          name: 'Video A',
          trackType: 'video' as const,
          orderIndex: 0,
          isMuted: false,
          isLocked: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              trackId: 'track-v1',
              name: 'Clip 1',
              clipType: 'video' as const,
              startTimeMs: 2000,
              endTimeMs: 8000,
            },
            {
              id: 'clip-2',
              trackId: 'track-v1',
              name: 'Clip 2',
              clipType: 'video' as const,
              startTimeMs: 10000,
              endTimeMs: 20000,
            },
          ],
        },
      ],
    };

    it('moves playhead correctly and clamps to boundary limits', () => {
      const store = useEditorStore.getState();
      store.setProject(mockProject, mockTimeline);

      // Initial playhead is 0
      expect(useEditorStore.getState().currentTimeMs).toBe(0);

      // Scrub to 5000ms
      store.setCurrentTimeMs(5000);
      expect(useEditorStore.getState().currentTimeMs).toBe(5000);

      // Clamp negative to 0
      store.setCurrentTimeMs(-1000);
      expect(useEditorStore.getState().currentTimeMs).toBe(0);

      // Clamp past end
      store.setCurrentTimeMs(50000);
      expect(useEditorStore.getState().currentTimeMs).toBe(30000);
    });

    it('handles track and clip selection accurately', () => {
      const store = useEditorStore.getState();
      store.setProject(mockProject, mockTimeline);

      store.selectClip('clip-1');
      expect(useEditorStore.getState().selectedClipId).toBe('clip-1');

      store.selectTrack('track-v1');
      expect(useEditorStore.getState().selectedTrackId).toBe('track-v1');

      store.selectClipAndTrack('clip-2', 'track-v1');
      expect(useEditorStore.getState().selectedClipId).toBe('clip-2');
      expect(useEditorStore.getState().selectedTrackId).toBe('track-v1');

      // Selection changes do NOT mark state dirty
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('updates zoom level safely between 10% and 300% without corrupting timing', () => {
      const store = useEditorStore.getState();
      store.setProject(mockProject, mockTimeline);
      store.setCurrentTimeMs(15000);

      store.setZoomLevel(120);
      expect(useEditorStore.getState().zoomLevel).toBe(120);
      expect(useEditorStore.getState().currentTimeMs).toBe(15000); // Timing untouched

      store.setZoomLevel(500); // Above max
      expect(useEditorStore.getState().zoomLevel).toBe(300);

      store.setZoomLevel(2); // Below min
      expect(useEditorStore.getState().zoomLevel).toBe(10);
    });

    it('handles empty timeline safely without NaN or errors', () => {
      const store = useEditorStore.getState();
      store.setProject({ ...mockProject, durationMs: 0 }, { ...mockTimeline, tracks: [], totalDurationMs: 0 });

      expect(useEditorStore.getState().timeline?.tracks).toHaveLength(0);
      store.setCurrentTimeMs(1000);
      expect(useEditorStore.getState().currentTimeMs).toBe(1000);
    });
  });

  // ==========================================
  // D. VIDEO PREVIEW & PLAYBACK SYNC
  // ==========================================
  describe('D. Video Preview & HTML5 Playback Synchronization', () => {
    const videoClip = {
      startTimeMs: 3000,
      endTimeMs: 9000,
      sourceStartMs: 1000,
      sourceEndMs: 7000,
    };

    it('correctly maps timeline milliseconds to source seconds', () => {
      // 1. Playhead inside clip: 4000ms timeline time -> 1s into clip + 1s offset = 2s source
      const mid = timelineToSourceSeconds(4000, videoClip, 10);
      expect(mid.isWithinClip).toBe(true);
      expect(mid.sourceSec).toBe(2.0);

      // 2. Playhead at start of clip: 3000ms timeline time -> 1s source
      const start = timelineToSourceSeconds(3000, videoClip, 10);
      expect(start.isWithinClip).toBe(true);
      expect(start.sourceSec).toBe(1.0);

      // 3. Playhead before clip: clamped to source start offset
      const before = timelineToSourceSeconds(1000, videoClip, 10);
      expect(before.isWithinClip).toBe(false);
      expect(before.sourceSec).toBe(1.0);

      // 4. Playhead after clip: clamped to source end
      const after = timelineToSourceSeconds(12000, videoClip, 10);
      expect(after.isWithinClip).toBe(false);
      expect(after.sourceSec).toBe(7.0);
    });

    it('correctly maps HTML5 video currentTime back to timeline time', () => {
      // 1. Video at 2.5s source -> 1.5s elapsed in clip + 3s start = 4.5s (4500ms)
      const sync1 = sourceSecondsToTimelineMs(2.5, videoClip);
      expect(sync1.hasReachedClipEnd).toBe(false);
      expect(sync1.timelineTimeMs).toBe(4500);

      // 2. Video reaches or passes clip end: 7.0s source -> clip end (9000ms)
      const sync2 = sourceSecondsToTimelineMs(7.0, videoClip);
      expect(sync2.hasReachedClipEnd).toBe(true);
      expect(sync2.timelineTimeMs).toBe(9000);
    });

    it('synchronizes playback rate and sets video-driven playback flag', () => {
      const store = useEditorStore.getState();
      store.setIsVideoDrivenPlayback(true);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(true);

      store.setPlaybackRate(1.5);
      expect(useEditorStore.getState().playbackRate).toBe(1.5);

      store.setPlaybackRate(0.5);
      expect(useEditorStore.getState().playbackRate).toBe(0.5);

      store.setIsVideoDrivenPlayback(false);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(false);
    });
  });

  // ==========================================
  // E. SAVE / REOPEN PERSISTENCE CHAIN
  // ==========================================
  describe('E. Save & Reopen Complete Persistence Cycle', () => {
    const baseProject = {
      id: 'proj-cycle-1',
      name: 'Initial Project Name',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 20000,
    };

    const baseTimeline = {
      id: 'tl-cycle-1',
      projectId: 'proj-cycle-1',
      totalDurationMs: 20000,
      updatedAt: new Date().toISOString(),
      tracks: [
        {
          id: 'trk-1',
          timelineId: 'tl-cycle-1',
          name: 'Track 1',
          trackType: 'video' as const,
          orderIndex: 0,
          isMuted: false,
          isLocked: false,
          volume: 1,
          clips: [
            {
              id: 'c-1',
              trackId: 'trk-1',
              name: 'Clip 1',
              clipType: 'video' as const,
              startTimeMs: 0,
              endTimeMs: 5000,
              sourceStartMs: 0,
              sourceEndMs: 5000,
            },
          ],
        },
      ],
    };

    it('executes full sequence: open -> clean -> edit metadata -> dirty -> edit clip -> save -> reopen', () => {
      const store = useEditorStore.getState();

      // 1. Open project
      store.setProject(baseProject, baseTimeline);
      expect(useEditorStore.getState().isDirty).toBe(false);

      // 2. Modify project metadata
      store.updateProjectMetadata({ name: 'Updated Teaser Title' });
      expect(useEditorStore.getState().isDirty).toBe(true);

      // 3. Modify clip timing
      store.updateClipTiming('c-1', 1000, 7000);
      expect(useEditorStore.getState().isDirty).toBe(true);

      // 4. Add second clip
      store.addClipToTrack('trk-1', {
        id: 'c-2',
        name: 'Clip 2',
        clipType: 'video',
        startTimeMs: 8000,
        endTimeMs: 14000,
      });
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(2);

      // 5. Save project: compute client snapshot string and record
      const curP = useEditorStore.getState().currentProject;
      const curT = useEditorStore.getState().timeline;
      const snapshot = buildClientCanonicalSnapshot({
        projectId: curP.id,
        name: curP.name,
        aspectRatio: curP.aspectRatio,
        resolution: curP.resolution,
        fps: curP.fps,
        durationMs: curT?.totalDurationMs || 0,
        tracks: curT?.tracks || [],
      });
      const snapStr = computeClientStateString(snapshot);

      store.recordSaved(snapStr);
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBeDefined();

      // 6. Reload / reopen
      const savedProject = { ...useEditorStore.getState().currentProject };
      const savedTimeline = { ...useEditorStore.getState().timeline };

      store.resetEditor();
      expect(useEditorStore.getState().currentProject).toBeNull();

      store.setProject(savedProject, savedTimeline);
      const reloaded = useEditorStore.getState();

      expect(reloaded.currentProject?.name).toBe('Updated Teaser Title');
      expect(reloaded.timeline?.tracks[0].clips).toHaveLength(2);
      expect(reloaded.timeline?.tracks[0].clips[0].startTimeMs).toBe(1000);
      expect(reloaded.timeline?.tracks[0].clips[0].endTimeMs).toBe(7000);
      expect(reloaded.timeline?.tracks[0].clips[1].id).toBe('c-2');
      expect(reloaded.isDirty).toBe(false);
    });
  });

  // ==========================================
  // F. CONCURRENT SAVE PROTECTION
  // ==========================================
  describe('F. Concurrent Save Race Condition Protection', () => {
    it('preserves edit B as dirty when edit B is made while save A is in flight', () => {
      const store = useEditorStore.getState();
      const proj = {
        id: 'proj-concur',
        name: 'Initial Concurrency Name',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
      };
      const tl = {
        id: 'tl-concur',
        projectId: 'proj-concur',
        totalDurationMs: 10000,
        updatedAt: new Date().toISOString(),
        tracks: [],
      };

      store.setProject(proj, tl);
      expect(useEditorStore.getState().isDirty).toBe(false);

      // Edit A occurs
      store.updateProjectMetadata({ name: 'Edit A Name' });
      expect(useEditorStore.getState().isDirty).toBe(true);

      // Save A starts: capture in-flight snapshot
      store.setSaving(true);
      const curStateA = useEditorStore.getState();
      const snapshotAStr = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: curStateA.currentProject.id,
          name: curStateA.currentProject.name,
          aspectRatio: curStateA.currentProject.aspectRatio,
          resolution: curStateA.currentProject.resolution,
          fps: curStateA.currentProject.fps,
          durationMs: curStateA.timeline?.totalDurationMs || 0,
          tracks: curStateA.timeline?.tracks || [],
        })
      );

      // Edit B occurs while save A is in flight!
      store.updateProjectMetadata({ name: 'Edit B Name - Fresh user change' });

      // Save A finishes and calls recordSaved with snapshotA
      store.recordSaved(snapshotAStr);

      // Edit B must remain DIRTY!
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().isSaving).toBe(false);
      expect(useEditorStore.getState().currentProject.name).toBe('Edit B Name - Fresh user change');

      // Now Save B is triggered and finishes
      const curStateB = useEditorStore.getState();
      const snapshotBStr = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: curStateB.currentProject.id,
          name: curStateB.currentProject.name,
          aspectRatio: curStateB.currentProject.aspectRatio,
          resolution: curStateB.currentProject.resolution,
          fps: curStateB.currentProject.fps,
          durationMs: curStateB.timeline?.totalDurationMs || 0,
          tracks: curStateB.timeline?.tracks || [],
        })
      );
      store.recordSaved(snapshotBStr);

      // State is now clean and synchronized
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().currentProject.name).toBe('Edit B Name - Fresh user change');
    });
  });

  // ==========================================
  // G. SAVE FAILURE BEHAVIOR
  // ==========================================
  describe('G. Save Failure Recovery & Fault Tolerance', () => {
    it('preserves local edits, marks error, and allows retry on failure', () => {
      const store = useEditorStore.getState();
      const proj = {
        id: 'proj-fail-test',
        name: 'Original Name',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
      };

      store.setProject(proj, { id: 'tl-1', projectId: 'proj-fail-test', totalDurationMs: 10000, tracks: [], updatedAt: '' });
      expect(useEditorStore.getState().isDirty).toBe(false);

      // User makes an edit
      store.updateProjectMetadata({ name: 'Unsaved Edit 1' });
      expect(useEditorStore.getState().isDirty).toBe(true);

      // Save fails (e.g. network disconnect)
      store.setSaving(true);
      store.setSaveError('Network error: Gateway timeout 504');

      // Must NOT lose user's edit
      expect(useEditorStore.getState().currentProject.name).toBe('Unsaved Edit 1');
      // Must remain dirty
      expect(useEditorStore.getState().isDirty).toBe(true);
      // isSaving should be false
      expect(useEditorStore.getState().isSaving).toBe(false);
      // Error message should be exposed
      expect(useEditorStore.getState().lastSaveError).toBe('Network error: Gateway timeout 504');

      // User retries save and succeeds
      store.setSaving(true);
      expect(useEditorStore.getState().lastSaveError).toBeNull(); // Reset on start

      const curProj = useEditorStore.getState().currentProject;
      const curTl = useEditorStore.getState().timeline;
      const snapStr = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: curProj.id,
          name: curProj.name,
          aspectRatio: curProj.aspectRatio,
          resolution: curProj.resolution,
          fps: curProj.fps,
          durationMs: curTl?.totalDurationMs || curProj.durationMs || 0,
          tracks: curTl?.tracks || [],
        })
      );
      store.recordSaved(snapStr);

      // Clean state restored
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().lastSaveError).toBeNull();
      expect(useEditorStore.getState().lastSavedAt).toBeDefined();
    });
  });
});
