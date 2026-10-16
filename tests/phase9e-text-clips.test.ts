import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  getActiveTextClipsAtTime,
  isTextClipVisibleAtTime,
  normalizeTextClipProperties,
} from '../src/features/editor/utils/textClip';

describe('Phase 9E: Text Clips & Basic Text Overlays', () => {
  const sampleMediaAsset: EditorMediaAsset = {
    id: 'asset-9e-video',
    storageKey: 'raw/user-1/asset-9e-video.mp4',
    originalFilename: 'background_footage.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 18000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 20000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedTextTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleMediaAsset]);

    store.setProject(
      {
        id: 'proj-9e-1',
        name: 'Text Overlay Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9e-1',
        projectId: 'proj-9e-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-text-1',
            timelineId: 'timeline-9e-1',
            name: 'Text Overlay Track',
            trackType: 'text',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [],
          },
          {
            id: 'track-video-1',
            timelineId: 'timeline-9e-1',
            name: 'Video Track 1',
            trackType: 'video',
            orderIndex: 1,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-video-1',
                trackId: 'track-video-1',
                name: 'Background Video',
                clipType: 'video',
                mediaAssetId: 'asset-9e-video',
                startTimeMs: 0,
                endTimeMs: 15000,
                sourceStartMs: 0,
                sourceEndMs: 15000,
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
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedTextTimeline();
  });

  it('1. creates a text clip on the appropriate track and selects it', () => {
    const store = useEditorStore.getState();

    const clipId = store.addTextClip();
    expect(clipId).toBeTruthy();

    const state = useEditorStore.getState();
    const textTrack = state.timeline!.tracks.find((t) => t.id === 'track-text-1')!;
    expect(textTrack.clips.length).toBe(1);

    const createdClip = textTrack.clips[0] as any;
    expect(createdClip.id).toBe(clipId);
    expect(createdClip.clipType).toBe('text');
    expect(createdClip.trackId).toBe('track-text-1');
    expect(state.selectedClipId).toBe(clipId);
    expect(state.selectedTrackId).toBe('track-text-1');
  });

  it('2. assigns unique IDs to multiple created text clips', () => {
    const store = useEditorStore.getState();

    const id1 = store.addTextClip();
    const id2 = store.addTextClip();
    const id3 = store.addTextClip();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id3).toBeTruthy();
    expect(new Set([id1, id2, id3]).size).toBe(3);
  });

  it('3. creates text clip with valid default timing and canonical text/transform defaults', () => {
    const store = useEditorStore.getState();
    store.setCurrentTimeMs(2500);

    const clipId = store.addTextClip()!;
    const createdClip = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;

    expect(createdClip.startTimeMs).toBe(2500);
    expect(createdClip.endTimeMs).toBe(7500);
    expect(createdClip.endTimeMs - createdClip.startTimeMs).toBe(5000);

    const textProps = normalizeTextClipProperties(createdClip);
    expect(textProps.textContent).toBe('Headline Text');
    expect(textProps.fontSize).toBe(48);
    expect(textProps.fontWeight).toBe(700);
    expect(textProps.textAlign).toBe('center');
    expect(textProps.color).toBe('#FFFFFF');
    expect(createdClip.transform.x).toBe(0);
    expect(createdClip.transform.y).toBe(0);
    expect(createdClip.transform.opacity).toBe(1);
  });

  it('4. edits text content accurately', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { textContent: 'Launch Announcement' });

    const updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.textContent).toBe('Launch Announcement');
    expect(updated.textProperties.textContent).toBe('Launch Announcement');
  });

  it('5. edits font size and clamps to valid bounds', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { fontSize: 72 });
    let updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.fontSize).toBe(72);
    expect(updated.textProperties.fontSize).toBe(72);

    // Clamps excessively small font size
    store.updateTextClip(clipId, { fontSize: 1 });
    updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.fontSize).toBeGreaterThanOrEqual(8);
  });

  it('6. edits font weight accurately', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { fontWeight: 400 });
    const updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.fontWeight).toBe(400);
    expect(updated.textProperties.fontWeight).toBe(400);
  });

  it('7. edits text alignment (left, center, right)', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { textAlign: 'left' });
    let updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.textAlign).toBe('left');
    expect(updated.textProperties.alignment).toBe('left');

    store.updateTextClip(clipId, { alignment: 'right' });
    updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.textAlign).toBe('right');
    expect(updated.textProperties.textAlign).toBe('right');
  });

  it('8. edits text color accurately', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { color: '#38BDF8' });
    const updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.style.color).toBe('#38BDF8');
    expect(updated.textProperties.color).toBe('#38BDF8');
  });

  it('9. edits text clip X and Y position', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { x: 85, y: -120 });
    const updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.transform.x).toBe(85);
    expect(updated.transform.positionX).toBe(85);
    expect(updated.transform.y).toBe(-120);
    expect(updated.transform.positionY).toBe(-120);
  });

  it('10. edits text clip opacity and clamps to [0, 1]', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip()!;

    store.updateTextClip(clipId, { opacity: 0.75 });
    let updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.transform.opacity).toBe(0.75);

    store.updateTextClip(clipId, { opacity: 2.5 });
    updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.transform.opacity).toBe(1);

    store.updateTextClip(clipId, { opacity: -0.4 });
    updated = useEditorStore
      .getState()
      .timeline!.tracks[0].clips.find((c) => c.id === clipId) as any;
    expect(updated.transform.opacity).toBe(0);
  });

  it('11. text clip respects timeline visibility interval (startTimeMs <= currentTimeMs < endTimeMs)', () => {
    const store = useEditorStore.getState();
    const clipId = store.addTextClip({
      startTimeMs: 3000,
      durationMs: 4000, // 3000ms..7000ms
      textContent: 'Timed Caption',
    })!;

    const timeline = useEditorStore.getState().timeline!;
    const clip = timeline.tracks[0].clips.find((c) => c.id === clipId)!;

    // Before startTimeMs (2999ms) -> NOT visible
    expect(isTextClipVisibleAtTime(clip, 2999)).toBe(false);
    expect(getActiveTextClipsAtTime(timeline, 2999)).toHaveLength(0);

    // At exact startTimeMs (3000ms) -> visible
    expect(isTextClipVisibleAtTime(clip, 3000)).toBe(true);
    expect(getActiveTextClipsAtTime(timeline, 3000)).toHaveLength(1);

    // Inside interval (5000ms) -> visible
    expect(isTextClipVisibleAtTime(clip, 5000)).toBe(true);
    expect(getActiveTextClipsAtTime(timeline, 5000)[0].textProperties.textContent).toBe('Timed Caption');

    // At exact endTimeMs (7000ms) -> NOT visible (startTimeMs <= currentTimeMs < endTimeMs)
    expect(isTextClipVisibleAtTime(clip, 7000)).toBe(false);
    expect(getActiveTextClipsAtTime(timeline, 7000)).toHaveLength(0);

    // After endTimeMs (9500ms) -> NOT visible
    expect(isTextClipVisibleAtTime(clip, 9500)).toBe(false);
    expect(getActiveTextClipsAtTime(timeline, 9500)).toHaveLength(0);
  });

  it('12. deleting a text clip removes only that clip and preserves other clips and tracks', () => {
    const store = useEditorStore.getState();
    const id1 = store.addTextClip({ textContent: 'First Text' })!;
    const id2 = store.addTextClip({ textContent: 'Second Text' })!;

    store.deleteClip(id1);

    const state = useEditorStore.getState();
    const textTrack = state.timeline!.tracks.find((t) => t.id === 'track-text-1')!;
    const videoTrack = state.timeline!.tracks.find((t) => t.id === 'track-video-1')!;

    expect(textTrack.clips).toHaveLength(1);
    expect(textTrack.clips[0].id).toBe(id2);
    expect(videoTrack.clips).toHaveLength(1);
    expect(videoTrack.clips[0].id).toBe('clip-video-1');
  });

  it('13. adding and editing text clips marks project dirty', () => {
    const store = useEditorStore.getState();
    expect(useEditorStore.getState().isDirty).toBe(false);

    const clipId = store.addTextClip()!;
    expect(useEditorStore.getState().isDirty).toBe(true);

    // Record saved state, then edit text content
    useEditorStore.getState().recordSaved();
    expect(useEditorStore.getState().isDirty).toBe(false);

    store.updateTextClip(clipId, { textContent: 'Updated Dirty Text' });
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('14. creating, editing, and deleting text clips does not modify media assets', () => {
    const store = useEditorStore.getState();
    const mediaBefore = JSON.parse(JSON.stringify(store.projectMedia));

    const clipId = store.addTextClip({ textContent: 'Overlay' })!;
    store.updateTextClip(clipId, {
      textContent: 'Edited Overlay',
      fontSize: 64,
      color: '#F43F5E',
      x: 40,
      y: -30,
      opacity: 0.9,
    });
    store.deleteClip(clipId);

    const mediaAfter = useEditorStore.getState().projectMedia;
    expect(mediaAfter).toEqual(mediaBefore);
  });
});
