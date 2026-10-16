import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  collectTimelineTransitions,
  evaluateTransitionAtTime,
  getActiveTransitionStateForClip,
  validateAdjacentClipTransition,
} from '../src/features/editor/utils/clipTransition';
import { buildClientCanonicalSnapshot } from '../src/features/editor/utils/projectSnapshot';
import { buildCanonicalSnapshot } from '../server/services/projectSnapshotService';

describe('Phase 9G: Basic Clip Transitions', () => {
  const sampleVideoAssetA: EditorMediaAsset = {
    id: 'asset-9g-video-a',
    storageKey: 'raw/user-1/asset-9g-video-a.mp4',
    originalFilename: 'scene_one.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 12000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 15000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  const sampleVideoAssetB: EditorMediaAsset = {
    id: 'asset-9g-video-b',
    storageKey: 'raw/user-1/asset-9g-video-b.mp4',
    originalFilename: 'scene_two.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 14000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 15000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedTransitionTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleVideoAssetA, sampleVideoAssetB]);

    store.setProject(
      {
        id: 'proj-9g-1',
        name: 'Transitions Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9g-1',
        projectId: 'proj-9g-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'timeline-9g-1',
            name: 'Video Track 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-v1',
                trackId: 'track-video-1',
                name: 'Scene 1',
                clipType: 'video',
                mediaAssetId: 'asset-9g-video-a',
                startTimeMs: 0,
                endTimeMs: 5000,
                sourceStartMs: 1000,
                sourceEndMs: 6000,
                slotBinding: 'hero_slot_1',
                transform: {
                  x: 10,
                  y: -5,
                  positionX: 10,
                  positionY: -5,
                  scale: 1.1,
                  rotation: 0,
                  opacity: 1,
                },
                crop: { top: 0, right: 0, bottom: 0, left: 0 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
              {
                id: 'clip-v2',
                trackId: 'track-video-1',
                name: 'Scene 2',
                clipType: 'video',
                mediaAssetId: 'asset-9g-video-b',
                startTimeMs: 5000,
                endTimeMs: 10000,
                sourceStartMs: 500,
                sourceEndMs: 5500,
                slotBinding: 'hero_slot_2',
                transform: {
                  x: 0,
                  y: 0,
                  positionX: 0,
                  positionY: 0,
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                },
                crop: { top: 0, right: 0, bottom: 0, left: 0 },
                audioProperties: { volume: 0.9, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
              {
                id: 'clip-v3-gapped',
                trackId: 'track-video-1',
                name: 'Scene 3 (After Gap)',
                clipType: 'video',
                mediaAssetId: 'asset-9g-video-a',
                startTimeMs: 14000,
                endTimeMs: 19000,
                sourceStartMs: 0,
                sourceEndMs: 5000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                crop: { top: 0, right: 0, bottom: 0, left: 0 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
          {
            id: 'track-video-2',
            timelineId: 'timeline-9g-1',
            name: 'Video Track 2',
            trackType: 'video',
            orderIndex: 1,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-other-track',
                trackId: 'track-video-2',
                name: 'Other Track Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9g-video-b',
                startTimeMs: 5000,
                endTimeMs: 9000,
                sourceStartMs: 0,
                sourceEndMs: 4000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                crop: { top: 0, right: 0, bottom: 0, left: 0 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedTransitionTimeline();
  });

  it('1. adds a cut transition between adjacent video clips', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'cut',
      durationMs: 250,
    });

    expect(trId).toBeTruthy();
    const state = useEditorStore.getState();
    const transitions = collectTimelineTransitions(state.timeline);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      id: trId,
      type: 'cut',
      durationMs: 250,
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      trackId: 'track-video-1',
    });
    expect(state.selectedTransitionId).toBe(trId);
  });

  it('2. adds a crossfade transition between adjacent video clips', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 800,
    });

    expect(trId).toBeTruthy();
    const transitions = collectTimelineTransitions(useEditorStore.getState().timeline);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].type).toBe('crossfade');
    expect(transitions[0].durationMs).toBe(800);
  });

  it('3. stores transition duration in integer milliseconds', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 650.4,
    })!;

    const transitions = collectTimelineTransitions(useEditorStore.getState().timeline);
    expect(transitions[0].id).toBe(trId);
    expect(transitions[0].durationMs).toBe(650);
  });

  it('4. rejects invalid or non-adjacent clip pairs and out-of-bounds durations', () => {
    const store = useEditorStore.getState();

    // Non-existent clip
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-missing',
        type: 'crossfade',
        durationMs: 500,
      }),
    ).toBeNull();

    // Different tracks
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-other-track',
        type: 'crossfade',
        durationMs: 500,
      }),
    ).toBeNull();

    // Non-adjacent (clip-v1 -> clip-v3-gapped skips clip-v2)
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-v3-gapped',
        type: 'crossfade',
        durationMs: 500,
      }),
    ).toBeNull();

    // Sequential on track but separated by a 4000ms gap (clip-v2 ends at 10000, clip-v3-gapped starts at 14000)
    expect(
      store.addTransition({
        fromClipId: 'clip-v2',
        toClipId: 'clip-v3-gapped',
        type: 'crossfade',
        durationMs: 500,
      }),
    ).toBeNull();

    // Non-positive duration (0 or negative)
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-v2',
        type: 'crossfade',
        durationMs: 0,
      }),
    ).toBeNull();
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-v2',
        type: 'crossfade',
        durationMs: -300,
      }),
    ).toBeNull();

    // Duration exceeding clip boundary (clips are 5000ms each)
    expect(
      store.addTransition({
        fromClipId: 'clip-v1',
        toClipId: 'clip-v2',
        type: 'crossfade',
        durationMs: 6000,
      }),
    ).toBeNull();

    // Timeline remains clean with 0 transitions
    expect(collectTimelineTransitions(useEditorStore.getState().timeline)).toHaveLength(0);
  });

  it('5. references the correct fromClipId and toClipId without duplicating transition state inside both clips', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition('clip-v1', 'clip-v2', 'crossfade', 600)!;

    const state = useEditorStore.getState();
    const track = state.timeline!.tracks[0];
    expect(track.transitions).toHaveLength(1);
    expect(track.transitions![0]).toEqual({
      id: trId,
      type: 'crossfade',
      durationMs: 600,
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      trackId: 'track-video-1',
    });

    const fromClip = track.clips.find((c) => c.id === 'clip-v1') as any;
    const toClip = track.clips.find((c) => c.id === 'clip-v2') as any;
    expect(fromClip.transitionIn).toBeUndefined();
    expect(fromClip.transitionOut).toBeUndefined();
    expect(toClip.transitionIn).toBeUndefined();
    expect(toClip.transitionOut).toBeUndefined();
  });

  it('6. updates transition type and duration while preserving unrelated clip properties, template slot bindings, and media assets', () => {
    const store = useEditorStore.getState();
    const mediaBefore = JSON.parse(JSON.stringify(store.projectMedia));
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'cut',
      durationMs: 300,
    })!;

    const updatedOk = store.updateTransition(trId, {
      type: 'crossfade',
      durationMs: 1200,
    });
    expect(updatedOk).toBe(true);

    const state = useEditorStore.getState();
    const tr = collectTimelineTransitions(state.timeline)[0];
    expect(tr.type).toBe('crossfade');
    expect(tr.durationMs).toBe(1200);

    const clip1 = state.timeline!.tracks[0].clips[0] as any;
    const clip2 = state.timeline!.tracks[0].clips[1] as any;
    expect(clip1.slotBinding).toBe('hero_slot_1');
    expect(clip2.slotBinding).toBe('hero_slot_2');
    expect(clip1.transform.x).toBe(10);
    expect(clip1.transform.scale).toBe(1.1);
    expect(state.projectMedia).toEqual(mediaBefore);
  });

  it('7. removes a transition cleanly and clears selectedTransitionId', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 500,
    })!;
    expect(useEditorStore.getState().selectedTransitionId).toBe(trId);

    store.removeTransition(trId);

    const state = useEditorStore.getState();
    expect(collectTimelineTransitions(state.timeline)).toHaveLength(0);
    expect(state.selectedTransitionId).toBeNull();
  });

  it('8. includes canonical transition state in both client and server project snapshots', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      id: 'tr-canonical-1',
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 750,
    })!;

    const state = useEditorStore.getState();
    const clientSnap = buildClientCanonicalSnapshot({
      projectId: state.currentProject.id,
      name: state.currentProject.name,
      aspectRatio: state.currentProject.aspectRatio,
      resolution: state.currentProject.resolution,
      fps: state.currentProject.fps,
      durationMs: state.timeline!.totalDurationMs,
      tracks: state.timeline!.tracks,
      transitions: state.timeline!.transitions,
    });

    const serverSnap = buildCanonicalSnapshot({
      projectId: state.currentProject.id,
      name: state.currentProject.name,
      aspectRatio: state.currentProject.aspectRatio,
      resolution: state.currentProject.resolution,
      fps: state.currentProject.fps,
      durationMs: state.timeline!.totalDurationMs,
      tracks: state.timeline!.tracks,
      transitions: state.timeline!.transitions,
    });

    const expectedTransition = {
      id: trId,
      type: 'crossfade',
      durationMs: 750,
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      trackId: 'track-video-1',
    };

    expect(clientSnap.transitions).toEqual([expectedTransition]);
    expect(clientSnap.tracks[0].transitions).toEqual([expectedTransition]);
    expect(serverSnap.transitions).toEqual([expectedTransition]);
    expect(serverSnap.tracks[0].transitions).toEqual([expectedTransition]);
  });

  it('9. marks project dirty when adding, updating, or removing transitions', () => {
    const store = useEditorStore.getState();
    expect(useEditorStore.getState().isDirty).toBe(false);

    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 500,
    })!;
    expect(useEditorStore.getState().isDirty).toBe(true);

    store.recordSaved();
    expect(useEditorStore.getState().isDirty).toBe(false);

    store.updateTransition(trId, { durationMs: 900 });
    expect(useEditorStore.getState().isDirty).toBe(true);

    store.recordSaved();
    expect(useEditorStore.getState().isDirty).toBe(false);

    store.removeTransition(trId);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('10. calculates deterministic crossfade progress, effective opacity, and audio contribution', () => {
    const store = useEditorStore.getState();
    // Boundary between clip-v1 (0..5000) and clip-v2 (5000..10000) is 5000ms.
    // With durationMs = 1000ms, transition window is [4500ms, 5500ms].
    store.addTransition({
      id: 'tr-fade-1000',
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 1000,
    });

    const timeline = useEditorStore.getState().timeline!;
    const fromClip = timeline.tracks[0].clips[0];
    const toClip = timeline.tracks[0].clips[1];
    const tr = timeline.transitions![0];

    // Before transition window (4000ms)
    const before = evaluateTransitionAtTime(tr, fromClip, toClip, 4000);
    expect(before.isInTransition).toBe(false);
    expect(before.progress).toBe(0);
    expect(before.outgoingOpacity).toBe(1);
    expect(before.incomingOpacity).toBe(0);

    // At transition start (4500ms -> progress 0)
    const atStart = evaluateTransitionAtTime(tr, fromClip, toClip, 4500);
    expect(atStart.isInTransition).toBe(true);
    expect(atStart.progress).toBe(0);
    expect(atStart.outgoingOpacity).toBe(1);
    expect(atStart.incomingOpacity).toBe(0);

    // Quarter way (4750ms -> progress 0.25)
    const atQuarter = evaluateTransitionAtTime(tr, fromClip, toClip, 4750);
    expect(atQuarter.progress).toBe(0.25);
    expect(atQuarter.outgoingOpacity).toBe(0.75);
    expect(atQuarter.incomingOpacity).toBe(0.25);
    expect(atQuarter.outgoingAudioFactor).toBe(0.75);
    expect(atQuarter.incomingAudioFactor).toBe(0.25);

    // Midpoint at boundary (5000ms -> progress 0.5)
    const atMid = evaluateTransitionAtTime(tr, fromClip, toClip, 5000);
    expect(atMid.progress).toBe(0.5);
    expect(atMid.outgoingOpacity).toBe(0.5);
    expect(atMid.incomingOpacity).toBe(0.5);

    // Three-quarters way (5250ms -> progress 0.75)
    const atThreeQuarter = evaluateTransitionAtTime(tr, fromClip, toClip, 5250);
    expect(atThreeQuarter.progress).toBe(0.75);
    expect(atThreeQuarter.outgoingOpacity).toBe(0.25);
    expect(atThreeQuarter.incomingOpacity).toBe(0.75);

    // Active clip helper resolves role and effective opacity accurately
    const outgoingState = getActiveTransitionStateForClip(timeline, 'clip-v1', 4750);
    expect(outgoingState?.role).toBe('outgoing');
    expect(outgoingState?.effectiveOpacity).toBe(0.75);

    const incomingState = getActiveTransitionStateForClip(timeline, 'clip-v2', 5250);
    expect(incomingState?.role).toBe('incoming');
    expect(incomingState?.effectiveOpacity).toBe(0.75);
  });

  it('11. produces normal switching behavior for a cut transition', () => {
    const store = useEditorStore.getState();
    store.addTransition({
      id: 'tr-cut-1',
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'cut',
      durationMs: 400,
    });

    const timeline = useEditorStore.getState().timeline!;
    const fromClip = timeline.tracks[0].clips[0];
    const toClip = timeline.tracks[0].clips[1];
    const tr = timeline.transitions![0];

    // Before cut boundary (4900ms < 5000ms) -> outgoing clip at full opacity, incoming 0
    const beforeCut = evaluateTransitionAtTime(tr, fromClip, toClip, 4900);
    expect(beforeCut.activeClipId).toBe('clip-v1');
    expect(beforeCut.outgoingOpacity).toBe(1);
    expect(beforeCut.incomingOpacity).toBe(0);
    expect(beforeCut.outgoingAudioFactor).toBe(1);
    expect(beforeCut.incomingAudioFactor).toBe(0);

    // At/after cut boundary (5000ms) -> immediate switch to incoming clip at full opacity
    const afterCut = evaluateTransitionAtTime(tr, fromClip, toClip, 5000);
    expect(afterCut.activeClipId).toBe('clip-v2');
    expect(afterCut.outgoingOpacity).toBe(0);
    expect(afterCut.incomingOpacity).toBe(1);
    expect(afterCut.outgoingAudioFactor).toBe(0);
    expect(afterCut.incomingAudioFactor).toBe(1);
  });

  it('12. preserves existing clip timing and source media timing unchanged when adding, updating, or removing transitions', () => {
    const store = useEditorStore.getState();
    const trId = store.addTransition({
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 1000,
    })!;

    store.updateTransition(trId, { type: 'cut', durationMs: 400 });

    const track = useEditorStore.getState().timeline!.tracks[0];
    const clip1 = track.clips[0] as any;
    const clip2 = track.clips[1] as any;

    expect(clip1.startTimeMs).toBe(0);
    expect(clip1.endTimeMs).toBe(5000);
    expect(clip1.sourceStartMs).toBe(1000);
    expect(clip1.sourceEndMs).toBe(6000);

    expect(clip2.startTimeMs).toBe(5000);
    expect(clip2.endTimeMs).toBe(10000);
    expect(clip2.sourceStartMs).toBe(500);
    expect(clip2.sourceEndMs).toBe(5500);

    // Validate helper directly confirms adjacency without mutating clips
    const check = validateAdjacentClipTransition({
      timeline: useEditorStore.getState().timeline,
      fromClipId: 'clip-v1',
      toClipId: 'clip-v2',
      type: 'crossfade',
      durationMs: 1000,
    });
    expect(check.valid).toBe(true);
    expect(check.boundaryMs).toBe(5000);
  });
});
