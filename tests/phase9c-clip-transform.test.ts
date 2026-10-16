import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  DEFAULT_CLIP_TRANSFORM,
  normalizeClipTransform,
  buildClipTransformStyle,
} from '../src/features/editor/utils/clipTransform';

describe('Phase 9C: Clip Transform Controls', () => {
  const sampleMediaAsset: EditorMediaAsset = {
    id: 'asset-9c-video',
    storageKey: 'raw/user-1/asset-9c-video.mp4',
    originalFilename: 'transform_test.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 15000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 20000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedTransformTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleMediaAsset]);

    store.setProject(
      {
        id: 'proj-9c-1',
        name: 'Clip Transform Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9c-1',
        projectId: 'proj-9c-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'timeline-9c-1',
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
                mediaAssetId: 'asset-9c-video',
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
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
              {
                id: 'clip-2',
                trackId: 'track-video-1',
                name: 'Second Clip',
                clipType: 'video',
                mediaAssetId: 'asset-9c-video',
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
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedTransformTimeline();
  });

  it('1. default transform values are positionX=0, positionY=0, scale=1, rotation=0, opacity=1', () => {
    expect(DEFAULT_CLIP_TRANSFORM).toEqual({
      x: 0,
      y: 0,
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    });

    const normalizedEmpty = normalizeClipTransform(undefined);
    expect(normalizedEmpty.x).toBe(0);
    expect(normalizedEmpty.y).toBe(0);
    expect(normalizedEmpty.positionX).toBe(0);
    expect(normalizedEmpty.positionY).toBe(0);
    expect(normalizedEmpty.scale).toBe(1);
    expect(normalizedEmpty.rotation).toBe(0);
    expect(normalizedEmpty.opacity).toBe(1);

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
    expect(addedClip.transform).toEqual(DEFAULT_CLIP_TRANSFORM);
  });

  it('2. changing X updates canonical positionX / x and preview style', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-1');
    store.updateClipTransform('clip-1', { x: 120 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.x).toBe(120);
    expect(clip1.transform.positionX).toBe(120);
    expect(clip1.transform.y).toBe(0);
    expect(buildClipTransformStyle(clip1.transform).transform).toContain('translate(120px, 0px)');
  });

  it('3. changing Y updates canonical positionY / y and preview style', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-1');
    store.updateClipTransform('clip-1', { y: -75 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.y).toBe(-75);
    expect(clip1.transform.positionY).toBe(-75);
    expect(clip1.transform.x).toBe(0);
    expect(buildClipTransformStyle(clip1.transform).transform).toContain('translate(0px, -75px)');
  });

  it('4. changing scale updates canonical scale and preview style', () => {
    const store = useEditorStore.getState();
    store.updateClipTransform('clip-1', { scale: 1.5 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.scale).toBe(1.5);
    expect(buildClipTransformStyle(clip1.transform).transform).toContain('scale(1.5)');
  });

  it('5. changing rotation updates canonical rotation and preview style', () => {
    const store = useEditorStore.getState();
    store.updateClipTransform('clip-1', { rotation: 45 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.rotation).toBe(45);
    expect(buildClipTransformStyle(clip1.transform).transform).toContain('rotate(45deg)');
  });

  it('6. changing opacity updates canonical opacity and preview style', () => {
    const store = useEditorStore.getState();
    store.updateClipTransform('clip-1', { opacity: 0.65 });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.opacity).toBe(0.65);
    expect(buildClipTransformStyle(clip1.transform).opacity).toBe(0.65);
  });

  it('7. opacity clamps deterministically to [0, 1]', () => {
    const store = useEditorStore.getState();

    store.updateClipTransform('clip-1', { opacity: -0.5 });
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.opacity).toBe(0);

    store.updateClipTransform('clip-1', { opacity: 3.4 });
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.opacity).toBe(1);
  });

  it('8. scale cannot become <= 0 and clamps to minimum 0.01', () => {
    const store = useEditorStore.getState();

    store.updateClipTransform('clip-1', { scale: 0 });
    let clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.scale).toBe(0.01);

    store.updateClipTransform('clip-1', { scale: -2.5 });
    clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform.scale).toBe(0.01);
  });

  it('9. reset transform restores X=0, Y=0, Scale=1, Rotation=0, Opacity=1', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-1');

    store.updateClipTransform('clip-1', {
      x: 150,
      y: -90,
      scale: 2.2,
      rotation: -30,
      opacity: 0.4,
    });

    store.resetClipTransform('clip-1');

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.transform).toEqual({
      x: 0,
      y: 0,
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    });
  });

  it('10. transforming one clip does not modify another clip or MediaAsset records', () => {
    const store = useEditorStore.getState();

    const clip2Before = JSON.parse(
      JSON.stringify(store.timeline!.tracks[0].clips.find((c) => c.id === 'clip-2')),
    );
    const mediaBefore = JSON.parse(JSON.stringify(store.projectMedia));

    store.updateClipTransform('clip-1', {
      x: 80,
      y: 40,
      scale: 1.75,
      rotation: 15,
      opacity: 0.8,
    });

    const clip2After = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === 'clip-2');
    const mediaAfter = useEditorStore.getState().projectMedia;

    expect(clip2After).toEqual(clip2Before);
    expect(mediaAfter).toEqual(mediaBefore);
  });

  it('11. transform does not change timeline timing or source media timing', () => {
    const store = useEditorStore.getState();

    store.updateClipTransform('clip-1', {
      x: -200,
      y: 120,
      scale: 1.4,
      rotation: 90,
      opacity: 0.5,
    });

    const clip1 = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-1') as any;
    expect(clip1.startTimeMs).toBe(2000);
    expect(clip1.endTimeMs).toBe(10000);
    expect(clip1.sourceStartMs).toBe(1000);
    expect(clip1.sourceEndMs).toBe(9000);
  });

  it('12. transform marks project dirty and resetting back to saved state clears dirty flag', () => {
    const store = useEditorStore.getState();
    expect(useEditorStore.getState().isDirty).toBe(false);

    store.updateClipTransform('clip-1', { x: 50, scale: 1.25 });
    expect(useEditorStore.getState().isDirty).toBe(true);

    store.resetClipTransform('clip-1');
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
