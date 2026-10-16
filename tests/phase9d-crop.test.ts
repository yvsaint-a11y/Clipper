import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  DEFAULT_CLIP_CROP,
  normalizeClipCrop,
  buildClipCropCss,
} from '../src/features/editor/utils/clipCrop';

describe('Phase 9D: Crop & Visual Framing', () => {
  const sampleMediaAsset: EditorMediaAsset = {
    id: 'asset-9d-video',
    storageKey: 'raw/user-1/asset-9d-video.mp4',
    originalFilename: 'crop_test.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 16000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 20000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedCropTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleMediaAsset]);

    store.setProject(
      {
        id: 'proj-9d-1',
        name: 'Crop & Framing Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9d-1',
        projectId: 'proj-9d-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'timeline-9d-1',
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
                name: 'Hero Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9d-video',
                startTimeMs: 2000,
                endTimeMs: 10000,
                sourceStartMs: 1000,
                sourceEndMs: 9000,
                transform: {
                  x: 0,
                  y: 0,
                  positionX: 0,
                  positionY: 0,
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                },
                crop: {
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
              {
                id: 'clip-2',
                trackId: 'track-video-1',
                name: 'Second Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9d-video',
                startTimeMs: 12000,
                endTimeMs: 18000,
                sourceStartMs: 0,
                sourceEndMs: 6000,
                transform: {
                  x: 0,
                  y: 0,
                  positionX: 0,
                  positionY: 0,
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                },
                crop: {
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedCropTimeline();
  });

  it('1. default crop values are top=0, right=0, bottom=0, left=0', () => {
    expect(DEFAULT_CLIP_CROP).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });

    const normalizedEmpty = normalizeClipCrop(undefined);
    expect(normalizedEmpty).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(buildClipCropCss(normalizedEmpty)).toBe('inset(0% 0% 0% 0%)');

    const store = useEditorStore.getState();
    store.addClipToTrack('track-video-1', {
      id: 'clip-added',
      name: 'Added Clip',
      clipType: 'video',
      startTimeMs: 20000,
      endTimeMs: 25000,
    });

    const addedClip = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === 'clip-added') as any;
    expect(addedClip.crop).toEqual(DEFAULT_CLIP_CROP);
  });

  it('2. updating top crop updates canonical crop.top and preview clip-path without overwriting transform', () => {
    const store = useEditorStore.getState();
    store.updateClipTransform('clip-1', { x: 40, scale: 1.2 });
    store.updateClipCrop('clip-1', { top: 0.15 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.top).toBe(0.15);
    expect(clip1.crop.right).toBe(0);
    expect(clip1.crop.bottom).toBe(0);
    expect(clip1.crop.left).toBe(0);
    expect(clip1.transform.x).toBe(40);
    expect(clip1.transform.scale).toBe(1.2);
    expect(buildClipCropCss(clip1.crop)).toBe('inset(15% 0% 0% 0%)');
  });

  it('3. updating right crop updates canonical crop.right and preview clip-path', () => {
    const store = useEditorStore.getState();
    store.updateClipCrop('clip-1', { right: 0.25 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.right).toBe(0.25);
    expect(clip1.crop.top).toBe(0);
    expect(clip1.crop.bottom).toBe(0);
    expect(clip1.crop.left).toBe(0);
    expect(buildClipCropCss(clip1.crop)).toBe('inset(0% 25% 0% 0%)');
  });

  it('4. updating bottom crop updates canonical crop.bottom and preview clip-path', () => {
    const store = useEditorStore.getState();
    store.updateClipCrop('clip-1', { bottom: 0.2 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.bottom).toBe(0.2);
    expect(clip1.crop.top).toBe(0);
    expect(clip1.crop.right).toBe(0);
    expect(clip1.crop.left).toBe(0);
    expect(buildClipCropCss(clip1.crop)).toBe('inset(0% 0% 20% 0%)');
  });

  it('5. updating left crop updates canonical crop.left and preview clip-path', () => {
    const store = useEditorStore.getState();
    store.updateClipCrop('clip-1', { left: 0.3 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.left).toBe(0.3);
    expect(clip1.crop.top).toBe(0);
    expect(clip1.crop.right).toBe(0);
    expect(clip1.crop.bottom).toBe(0);
    expect(buildClipCropCss(clip1.crop)).toBe('inset(0% 0% 0% 30%)');
  });

  it('6. crop values clamp within [0, 1] and reject negative or >1 inputs', () => {
    const store = useEditorStore.getState();

    store.updateClipCrop('clip-1', { top: -0.4, right: -2, bottom: -0.1, left: -0.9 });
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.top).toBe(0);
    expect(clip1.crop.right).toBe(0);
    expect(clip1.crop.bottom).toBe(0);
    expect(clip1.crop.left).toBe(0);

    store.updateClipCrop('clip-1', { top: 1.8 });
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.top).toBeGreaterThanOrEqual(0);
    expect(clip1.crop.top).toBeLessThanOrEqual(1);
    expect(clip1.crop.top).toBeLessThan(1); // Cannot remove 100% of vertical area
  });

  it('7. prevents invalid combined crop from removing the entire visual area', () => {
    const store = useEditorStore.getState();

    // Set top to 0.6, then attempt to set bottom to 0.7 (sum = 1.3 >= 1)
    store.updateClipCrop('clip-1', { top: 0.6 });
    store.updateClipCrop('clip-1', { bottom: 0.7 });

    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.top).toBe(0.6);
    expect(clip1.crop.top + clip1.crop.bottom).toBeLessThanOrEqual(0.95);
    expect(1 - clip1.crop.top - clip1.crop.bottom).toBeGreaterThanOrEqual(0.05);

    // Set left to 0.7, then attempt to set right to 0.6 (sum = 1.3 >= 1)
    store.updateClipCrop('clip-1', { left: 0.7 });
    store.updateClipCrop('clip-1', { right: 0.6 });

    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop.left).toBe(0.7);
    expect(clip1.crop.left + clip1.crop.right).toBeLessThanOrEqual(0.95);
    expect(1 - clip1.crop.left - clip1.crop.right).toBeGreaterThanOrEqual(0.05);
  });

  it('8. reset crop restores top=0, right=0, bottom=0, left=0 on the selected clip', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-1');

    store.updateClipCrop('clip-1', {
      top: 0.1,
      right: 0.2,
      bottom: 0.15,
      left: 0.25,
    });

    store.resetClipCrop('clip-1');

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.crop).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('9. crop does not modify timeline timing (startTimeMs / endTimeMs)', () => {
    const store = useEditorStore.getState();

    store.updateClipCrop('clip-1', {
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
      left: 0.1,
    });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.startTimeMs).toBe(2000);
    expect(clip1.endTimeMs).toBe(10000);
  });

  it('10. crop does not modify source media timing (sourceStartMs / sourceEndMs)', () => {
    const store = useEditorStore.getState();

    store.updateClipCrop('clip-1', {
      top: 0.2,
      right: 0.15,
      bottom: 0.1,
      left: 0.25,
    });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.sourceStartMs).toBe(1000);
    expect(clip1.sourceEndMs).toBe(9000);
  });

  it('11. crop on one clip does not modify another clip or MediaAsset', () => {
    const store = useEditorStore.getState();

    const clip2Before = JSON.parse(
      JSON.stringify(store.timeline!.tracks[0].clips.find((c) => c.id === 'clip-2')),
    );
    const mediaBefore = JSON.parse(JSON.stringify(store.projectMedia));

    store.updateClipCrop('clip-1', {
      top: 0.25,
      right: 0.2,
      bottom: 0.15,
      left: 0.1,
    });

    const clip2After = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === 'clip-2');
    const mediaAfter = useEditorStore.getState().projectMedia;

    expect(clip2After).toEqual(clip2Before);
    expect(mediaAfter).toEqual(mediaBefore);
  });

  it('12. crop marks project dirty and resetting back to saved state clears dirty flag', () => {
    const store = useEditorStore.getState();
    expect(useEditorStore.getState().isDirty).toBe(false);

    store.updateClipCrop('clip-1', { top: 0.2, left: 0.1 });
    expect(useEditorStore.getState().isDirty).toBe(true);

    store.resetClipCrop('clip-1');
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
