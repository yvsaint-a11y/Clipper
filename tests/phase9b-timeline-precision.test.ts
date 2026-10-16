import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  msToPx,
  pxToMs,
  deltaPxToDeltaMs,
  clampPlayheadMs,
  collectSnapTargetsMs,
  snapTimeMs,
  snapClipMoveMs,
} from '../src/features/editor/utils/timelinePrecision';

describe('Phase 9B: Timeline Precision & Interaction', () => {
  const sampleMediaAsset: EditorMediaAsset = {
    id: 'asset-9b-video',
    storageKey: 'raw/user-1/asset-9b-video.mp4',
    originalFilename: 'precision_clip.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 18000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 25000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedPrecisionTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleMediaAsset]);

    store.setProject(
      {
        id: 'proj-9b-1',
        name: 'Timeline Precision Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9b-1',
        projectId: 'proj-9b-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'timeline-9b-1',
            name: 'Video Track 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-1',
                trackId: 'track-video-1',
                name: 'First Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9b-video',
                startTimeMs: 2000,
                endTimeMs: 7000,
                sourceStartMs: 1000,
                sourceEndMs: 6000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
              {
                id: 'clip-2',
                trackId: 'track-video-1',
                name: 'Neighbor Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9b-video',
                startTimeMs: 12000,
                endTimeMs: 18000,
                sourceStartMs: 0,
                sourceEndMs: 6000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedPrecisionTimeline();
  });

  it('1. ms -> pixel conversion is deterministic across zoom levels', () => {
    // At 50% zoom (50px/s), 2000ms = 100px
    expect(msToPx(2000, 50)).toBe(100);
    // At 100% zoom (100px/s), 2500ms = 250px
    expect(msToPx(2500, 100)).toBe(250);
    // At 200% zoom (200px/s), 1500ms = 300px
    expect(msToPx(1500, 200)).toBe(300);
    // Negative milliseconds clamp safely to 0px
    expect(msToPx(-500, 100)).toBe(0);
  });

  it('2. pixel -> ms conversion is deterministic and avoids floating-point drift', () => {
    // At 50% zoom (50px/s), 100px = 2000ms
    expect(pxToMs(100, 50)).toBe(2000);
    // At 100% zoom (100px/s), 375px = 3750ms
    expect(pxToMs(375, 100)).toBe(3750);
    // Round-trip conversion across prime/fractional zoom levels produces exact integer ms
    for (const zoom of [15, 33, 50, 75, 120, 240]) {
      const originalMs = 4000;
      const px = msToPx(originalMs, zoom);
      expect(pxToMs(px, zoom)).toBe(originalMs);
    }
    // Clamps to maxDurationMs when provided
    expect(pxToMs(99999, 100, 30000)).toBe(30000);
    expect(pxToMs(-50, 100, 30000)).toBe(0);
  });

  it('3. playhead clamping enforces [0, duration] and integer milliseconds', () => {
    const store = useEditorStore.getState();

    // Direct helper check
    expect(clampPlayheadMs(-120, 30000)).toBe(0);
    expect(clampPlayheadMs(45000, 30000)).toBe(30000);
    expect(clampPlayheadMs(1234.6, 30000)).toBe(1235);

    // Store action check
    store.setCurrentTimeMs(-900);
    expect(useEditorStore.getState().currentTimeMs).toBe(0);

    store.setCurrentTimeMs(14250.4);
    expect(useEditorStore.getState().currentTimeMs).toBe(14250);

    store.setCurrentTimeMs(95000);
    expect(useEditorStore.getState().currentTimeMs).toBe(30000);
  });

  it('4. snaps clip to timeline start (0ms) when within threshold', () => {
    const store = useEditorStore.getState();
    store.setSnapThresholdMs(150);

    // Move clip-1 to 110ms (within 150ms of timeline start 0ms)
    store.moveClip('clip-1', 110);

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(0);
    expect(clip1.endTimeMs).toBe(5000);
  });

  it('5. snaps clip to neighboring clip start when moving or trimming within threshold', () => {
    const store = useEditorStore.getState();
    store.setSnapThresholdMs(150);

    // clip-2 starts at 12000ms. Move clip-1 (duration 5000ms) to 6910ms so its end edge is 11910ms (90ms from 12000ms)
    store.moveClip('clip-1', 6910);
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.endTimeMs).toBe(12000);
    expect(clip1.startTimeMs).toBe(7000);

    // Also test moving clip-1 start edge near clip-2 start (12080ms -> snaps start to 12000ms)
    store.moveClip('clip-1', 12080);
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(12000);
    expect(clip1.endTimeMs).toBe(17000);
  });

  it('6. snaps clip to neighboring clip end when within threshold', () => {
    const store = useEditorStore.getState();
    store.setSnapThresholdMs(150);

    // clip-2 ends at 18000ms. Move clip-1 to 18095ms (within 150ms of 18000ms)
    store.moveClip('clip-1', 18095);

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(18000);
    expect(clip1.endTimeMs).toBe(23000);

    // Neighbor clip-2 must NOT be moved
    const clip2 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-2')!;
    expect(clip2.startTimeMs).toBe(12000);
    expect(clip2.endTimeMs).toBe(18000);
  });

  it('7. snaps clip move and trim to playhead when within threshold', () => {
    const store = useEditorStore.getState();
    store.setSnapThresholdMs(150);
    store.setCurrentTimeMs(9000);

    // Move clip-1 to 8920ms (80ms from playhead at 9000ms)
    store.moveClip('clip-1', 8920);
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(9000);
    expect(clip1.endTimeMs).toBe(14000);

    // Reset and trim clip-1 end to 6080ms when playhead is at 6000ms
    seedPrecisionTimeline();
    useEditorStore.getState().setCurrentTimeMs(6000);
    useEditorStore.getState().trimClipEnd('clip-1', 6080);
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.endTimeMs).toBe(6000);
  });

  it('8. does not snap when outside threshold', () => {
    const store = useEditorStore.getState();
    store.setSnapThresholdMs(150);
    store.setCurrentTimeMs(9000);

    // Move clip-1 to 4500ms (end at 9500ms; nearest target is playhead 9000ms which is 500ms away > 150ms)
    store.moveClip('clip-1', 4500);

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(4500);
    expect(clip1.endTimeMs).toBe(9500);

    // Pure helper verification
    const targets = collectSnapTargetsMs({
      tracks: useEditorStore.getState().timeline!.tracks,
      activeClipId: 'clip-1',
      playheadMs: 9000,
      projectEndMs: 30000,
    });
    const res = snapTimeMs(4500, targets, 150);
    expect(res.didSnap).toBe(false);
    expect(res.snappedMs).toBe(4500);
  });

  it('9. drag clamping prevents negative start and prevents exceeding project duration', () => {
    const store = useEditorStore.getState();

    // Attempt to drag clip-1 to negative start (-4000ms)
    store.moveClip('clip-1', -4000);
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(0);
    expect(clip1.endTimeMs).toBe(5000);

    // Attempt to drag clip-1 (duration 5000ms) past 30000ms project end
    store.moveClip('clip-1', 29000);
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1')!;
    expect(clip1.startTimeMs).toBe(25000);
    expect(clip1.endTimeMs).toBe(30000);
  });

  it('10. trim clamping prevents zero/negative duration and invalid source ranges', () => {
    const store = useEditorStore.getState();

    // clip-1 is 2000..7000, sourceStartMs=1000..6000
    // Attempt to trim start before source 0 (e.g. to 0ms when minAllowedStartMs is 1000ms)
    store.trimClipStart('clip-1', 0);
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.startTimeMs).toBe(1000);
    expect(clip1.sourceStartMs).toBe(0);
    expect(clip1.endTimeMs).toBe(7000);

    // Attempt to trim start past clip end (7000ms)
    store.trimClipStart('clip-1', 9000);
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.endTimeMs - clip1.startTimeMs).toBeGreaterThanOrEqual(100);
    expect(clip1.startTimeMs).toBe(6900);
    expect(clip1.endTimeMs).toBe(7000);

    // Reset and attempt to trim end before clip start (2000ms)
    seedPrecisionTimeline();
    useEditorStore.getState().trimClipEnd('clip-1', 500);
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.endTimeMs - clip1.startTimeMs).toBeGreaterThanOrEqual(100);
    expect(clip1.startTimeMs).toBe(2000);
    expect(clip1.endTimeMs).toBe(2100);
  });

  it('11. changing timeline zoom does NOT alter canonical clip timing or source media bounds', () => {
    const store = useEditorStore.getState();

    const beforeClips = JSON.parse(
      JSON.stringify(useEditorStore.getState().timeline!.tracks[0].clips),
    );

    // Cycle through multiple zoom levels
    store.setZoomLevel(10);
    store.setZoomLevel(125);
    store.setZoomLevel(300);
    store.setZoomLevel(75);

    const afterClips = useEditorStore.getState().timeline!.tracks[0].clips;
    expect(afterClips).toEqual(beforeClips);

    // Visual pixel width changes proportionally while canonical ms stays untouched
    const clip1 = afterClips[0];
    const durationMs = clip1.endTimeMs - clip1.startTimeMs; // 5000ms
    expect(msToPx(durationMs, 50)).toBe(250);
    expect(msToPx(durationMs, 100)).toBe(500);
    expect(msToPx(durationMs, 200)).toBe(1000);
  });

  it('12. playhead remains at the exact same canonical time after zoom changes and maps accurately to new pixel offset', () => {
    const store = useEditorStore.getState();

    store.setCurrentTimeMs(8450);
    expect(useEditorStore.getState().currentTimeMs).toBe(8450);

    store.setZoomLevel(50);
    expect(useEditorStore.getState().currentTimeMs).toBe(8450);
    const pxAt50 = msToPx(useEditorStore.getState().currentTimeMs, useEditorStore.getState().zoomLevel);
    expect(pxAt50).toBe(422.5);
    expect(pxToMs(pxAt50, 50)).toBe(8450);

    store.setZoomLevel(200);
    expect(useEditorStore.getState().currentTimeMs).toBe(8450);
    const pxAt200 = msToPx(useEditorStore.getState().currentTimeMs, useEditorStore.getState().zoomLevel);
    expect(pxAt200).toBe(1690);
    expect(pxToMs(pxAt200, 200)).toBe(8450);
  });
});
