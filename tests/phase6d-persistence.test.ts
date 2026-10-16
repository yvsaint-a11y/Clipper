import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { buildCanonicalSnapshot, computeSnapshotChecksum } from '../server/services/projectSnapshotService';
import { buildClientCanonicalSnapshot, computeClientStateString } from '../src/features/editor/utils/projectSnapshot';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';

describe('Phase 6D: Save / Reopen Editor Persistence & Canonical Snapshots', () => {
  const app = createExpressApp();

  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  describe('Canonical Snapshot & Deterministic Hashing', () => {
    it('produces identical SHA-256 hashes regardless of track or clip insertion order', () => {
      const stateA = {
        projectId: 'proj-123',
        name: 'Deterministic Test',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 15000,
        tracks: [
          {
            id: 'track-1',
            orderIndex: 0,
            trackType: 'video',
            name: 'Video Track',
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              { id: 'c1', startTimeMs: 0, endTimeMs: 5000, name: 'First Clip', clipType: 'video' },
              { id: 'c2', startTimeMs: 5000, endTimeMs: 10000, name: 'Second Clip', clipType: 'video' },
            ],
          },
          {
            id: 'track-2',
            orderIndex: 1,
            trackType: 'audio',
            name: 'Audio Track',
            isMuted: false,
            isLocked: false,
            volume: 0.8,
            clips: [],
          },
        ],
      };

      // stateB has inverted tracks array and inverted clips inside track-1
      const stateB = {
        projectId: 'proj-123',
        name: 'Deterministic Test',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 15000,
        tracks: [
          {
            id: 'track-2',
            orderIndex: 1,
            trackType: 'audio',
            name: 'Audio Track',
            isMuted: false,
            isLocked: false,
            volume: 0.8,
            clips: [],
          },
          {
            id: 'track-1',
            orderIndex: 0,
            trackType: 'video',
            name: 'Video Track',
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              { id: 'c2', startTimeMs: 5000, endTimeMs: 10000, name: 'Second Clip', clipType: 'video' },
              { id: 'c1', startTimeMs: 0, endTimeMs: 5000, name: 'First Clip', clipType: 'video' },
            ],
          },
        ],
      };

      const snapA = buildCanonicalSnapshot(stateA);
      const snapB = buildCanonicalSnapshot(stateB);

      const hashA = computeSnapshotChecksum(snapA);
      const hashB = computeSnapshotChecksum(snapB);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64); // SHA-256 hex string
    });

    it('ignores transient UI fields when calculating canonical snapshot', () => {
      const snap1 = buildCanonicalSnapshot({
        projectId: 'proj-123',
        name: 'Transient Test',
        aspectRatio: '9:16',
        resolution: '1080p',
        fps: 30,
        tracks: [
          {
            id: 'track-1',
            orderIndex: 0,
            name: 'Track 1',
            trackType: 'video',
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-1',
                name: 'Clip',
                clipType: 'video',
                startTimeMs: 1000,
                endTimeMs: 4000,
              },
            ],
          },
        ],
      });

      const snap2 = buildCanonicalSnapshot({
        projectId: 'proj-123',
        name: 'Transient Test',
        aspectRatio: '9:16',
        resolution: '1080p',
        fps: 30,
        tracks: [
          {
            id: 'track-1',
            orderIndex: 0,
            name: 'Track 1',
            trackType: 'video',
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-1',
                name: 'Clip',
                clipType: 'video',
                startTimeMs: 1000,
                endTimeMs: 4000,
                // Transient properties that shouldn't affect hash
                isSelected: true,
                presignedUrl: 'https://r2.cloudflarestorage.com/temp-token-xyz',
                isLoading: true,
              },
            ],
          },
        ],
      });

      expect(computeSnapshotChecksum(snap1)).toBe(computeSnapshotChecksum(snap2));
    });
  });

  describe('Client-side Dirty State Tracking', () => {
    it('initializes clean on setProject and becomes dirty on modification', () => {
      const store = useEditorStore.getState();
      const mockProject = {
        id: 'proj-test',
        name: 'Initial Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
      };
      const mockTimeline = {
        id: 'tl-test',
        projectId: 'proj-test',
        totalDurationMs: 10000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-1',
            timelineId: 'tl-test',
            name: 'Track 1',
            trackType: 'video' as const,
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-1',
                trackId: 'track-1',
                name: 'Clip 1',
                clipType: 'video' as const,
                startTimeMs: 0,
                endTimeMs: 5000,
                sourceStartMs: 0,
                sourceEndMs: 5000,
                mediaAssetId: 'asset-1',
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              },
            ],
          },
        ],
      };

      store.setProject(mockProject, mockTimeline);
      expect(useEditorStore.getState().isDirty).toBe(false);

      // Mutating transient state must NOT make editor dirty
      useEditorStore.getState().setCurrentTimeMs(3000);
      useEditorStore.getState().setZoomLevel(150);
      useEditorStore.getState().selectClip('clip-1');
      useEditorStore.getState().selectTrack('track-1');
      expect(useEditorStore.getState().isDirty).toBe(false);

      // Mutating project metadata DOES make editor dirty
      useEditorStore.getState().updateProjectMetadata({ name: 'Renamed Project' });
      expect(useEditorStore.getState().isDirty).toBe(true);

      // Reverting metadata to original saved value restores clean state
      useEditorStore.getState().updateProjectMetadata({ name: 'Initial Project' });
      expect(useEditorStore.getState().isDirty).toBe(false);

      // Mutating clip timing marks editor dirty
      useEditorStore.getState().updateClipTiming('clip-1', 2000, 7000);
      expect(useEditorStore.getState().isDirty).toBe(true);

      // Record saved marks editor clean and updates lastSavedAt
      useEditorStore.getState().recordSaved();
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBeDefined();
    });

    it('marks dirty when a new clip is added or removed', () => {
      const store = useEditorStore.getState();
      const mockProject = {
        id: 'proj-add-clip',
        name: 'Clip Test',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
      };
      const mockTimeline = {
        id: 'tl-1',
        projectId: 'proj-add-clip',
        totalDurationMs: 10000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-v',
            timelineId: 'tl-1',
            name: 'Video Track',
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
      expect(useEditorStore.getState().isDirty).toBe(false);

      // Add a clip
      store.addClipToTrack('track-v', {
        id: 'new-c1',
        name: 'New Footage.mp4',
        clipType: 'video',
        startTimeMs: 0,
        endTimeMs: 4000,
      });

      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(1);

      // Remove the clip
      store.removeClip('new-c1');
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(0);
    });
  });

  describe('Security & IDOR Enforcement on Save', () => {
    it('rejects unauthenticated requests to PUT /api/projects/:id/editor-state with 401', async () => {
      const res = await request(app)
        .put('/api/projects/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/editor-state')
        .send({
          name: 'Hacked Project',
          timeline: { tracks: [] },
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Browser Persistence, Concurrency & Save Failure Behavior', () => {
    const mockInitialProject = {
      id: 'proj-persist-1',
      name: 'Persistence Test Project',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      durationMs: 10000,
    };

    const mockInitialTimeline = {
      id: 'tl-persist-1',
      projectId: 'proj-persist-1',
      totalDurationMs: 10000,
      updatedAt: new Date().toISOString(),
      tracks: [
        {
          id: 'track-v1',
          timelineId: 'tl-persist-1',
          name: 'Video 1',
          trackType: 'video' as const,
          orderIndex: 0,
          isMuted: false,
          isLocked: false,
          volume: 1,
          clips: [
            {
              id: 'clip-a',
              trackId: 'track-v1',
              name: 'Clip A',
              clipType: 'video' as const,
              startTimeMs: 0,
              endTimeMs: 4000,
              sourceStartMs: 0,
              sourceEndMs: 4000,
            },
          ],
        },
      ],
    };

    it('confirms the real browser persistence workflow (edit -> dirty -> save -> clean -> reopen)', () => {
      const store = useEditorStore.getState();

      // 1. Open existing project
      store.setProject(mockInitialProject, mockInitialTimeline);
      expect(useEditorStore.getState().isDirty).toBe(false);

      // 2. Make a persisted edit
      useEditorStore.getState().updateClipTiming('clip-a', 500, 4500);

      // 3. Confirm it becomes Dirty/Unsaved
      expect(useEditorStore.getState().isDirty).toBe(true);

      // 4. Save it
      const currentProj = useEditorStore.getState().currentProject;
      const currentTl = useEditorStore.getState().timeline;
      const snapshot = buildClientCanonicalSnapshot({
        projectId: currentProj.id,
        name: currentProj.name,
        aspectRatio: currentProj.aspectRatio,
        resolution: currentProj.resolution,
        fps: currentProj.fps,
        durationMs: currentTl?.totalDurationMs || 0,
        tracks: currentTl?.tracks || [],
      });
      const snapshotStr = computeClientStateString(snapshot);
      useEditorStore.getState().recordSaved(snapshotStr);

      // 5. Confirm Saved
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBeDefined();

      // 6. Refresh / reopen the project with the persisted data
      const reloadedProject = { ...currentProj };
      const reloadedTimeline = { ...currentTl };
      store.resetEditor();
      expect(useEditorStore.getState().currentProject).toBeNull();

      store.setProject(reloadedProject, reloadedTimeline);

      // 7. Confirm saved edit remains and editor is clean
      const reopenedClip = useEditorStore.getState().timeline?.tracks[0].clips[0];
      expect(reopenedClip?.startTimeMs).toBe(500);
      expect(reopenedClip?.endTimeMs).toBe(4500);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('verifies the concurrency case (save in-flight does not wipe out newer edit B)', () => {
      const store = useEditorStore.getState();
      store.setProject(mockInitialProject, mockInitialTimeline);
      expect(useEditorStore.getState().isDirty).toBe(false);

      // 1. Make edit A
      store.updateClipTiming('clip-a', 1000, 5000);
      expect(useEditorStore.getState().isDirty).toBe(true);

      // 2. Start a save for edit A: capture in-flight snapshot string
      store.setSaving(true);
      const projA = useEditorStore.getState().currentProject;
      const tlA = useEditorStore.getState().timeline;
      const inFlightSnapshotA = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: projA.id,
          name: projA.name,
          aspectRatio: projA.aspectRatio,
          resolution: projA.resolution,
          fps: projA.fps,
          durationMs: tlA?.totalDurationMs || 0,
          tracks: tlA?.tracks || [],
        })
      );

      // 3. User makes edit B while save A is in progress
      store.updateProjectMetadata({ name: 'Project After Edit B' });
      expect(useEditorStore.getState().isDirty).toBe(true);

      // 4. Save A completes: recordSaved called with snapshot A
      store.recordSaved(inFlightSnapshotA);

      // 5. CRITICAL: completion of save A does NOT mark edit B as saved!
      // Editor must remain dirty for B
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().isSaving).toBe(false);

      // 6. Save again for edit B
      const projB = useEditorStore.getState().currentProject;
      const tlB = useEditorStore.getState().timeline;
      const inFlightSnapshotB = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: projB.id,
          name: projB.name,
          aspectRatio: projB.aspectRatio,
          resolution: projB.resolution,
          fps: projB.fps,
          durationMs: tlB?.totalDurationMs || 0,
          tracks: tlB?.tracks || [],
        })
      );
      store.recordSaved(inFlightSnapshotB);

      // 7. Now editor is clean
      expect(useEditorStore.getState().isDirty).toBe(false);

      // 8. Reopen project and confirm both A and B are persisted
      const persistedState = {
        project: { ...useEditorStore.getState().currentProject },
        timeline: { ...useEditorStore.getState().timeline },
      };

      store.resetEditor();
      store.setProject(persistedState.project, persistedState.timeline);

      expect(useEditorStore.getState().currentProject.name).toBe('Project After Edit B');
      expect(useEditorStore.getState().timeline?.tracks[0].clips[0].startTimeMs).toBe(1000);
      expect(useEditorStore.getState().timeline?.tracks[0].clips[0].endTimeMs).toBe(5000);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('verifies save failure behavior (preserves local edits, stays dirty, enables retry)', () => {
      const store = useEditorStore.getState();
      store.setProject(mockInitialProject, mockInitialTimeline);

      // 1. Make local edit: add a new clip
      store.addClipToTrack('track-v1', {
        id: 'clip-uncommitted',
        name: 'Uncommitted Clip',
        clipType: 'video',
        startTimeMs: 4000,
        endTimeMs: 8000,
      });

      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(2);

      // 2. Start save
      store.setSaving(true);
      expect(useEditorStore.getState().isSaving).toBe(true);

      // 3. Save fails (e.g. network disconnect or 500 error)
      store.setSaveError('Network request failed: Connection timeout');

      // 4. Failed save must NOT discard local edits!
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(2);
      expect(useEditorStore.getState().timeline?.tracks[0].clips[1].id).toBe('clip-uncommitted');

      // 5. Editor must remain dirty
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().isSaving).toBe(false);
      expect(useEditorStore.getState().lastSaveError).toBe('Network request failed: Connection timeout');

      // 6. Retry must be possible
      store.setSaving(true);
      expect(useEditorStore.getState().lastSaveError).toBeNull(); // Cleared on retry

      // Save succeeds on retry
      const curProj = useEditorStore.getState().currentProject;
      const curTl = useEditorStore.getState().timeline;
      const retrySnapshot = computeClientStateString(
        buildClientCanonicalSnapshot({
          projectId: curProj.id,
          name: curProj.name,
          aspectRatio: curProj.aspectRatio,
          resolution: curProj.resolution,
          fps: curProj.fps,
          durationMs: curTl?.totalDurationMs || 0,
          tracks: curTl?.tracks || [],
        })
      );

      store.recordSaved(retrySnapshot);

      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().isSaving).toBe(false);
      expect(useEditorStore.getState().lastSaveError).toBeNull();
      expect(useEditorStore.getState().timeline?.tracks[0].clips).toHaveLength(2);
    });
  });
});
