import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import { buildClientCanonicalSnapshot } from '../src/features/editor/utils/projectSnapshot';

describe('Phase 9A: Timeline Editing Core', () => {
  const sampleMediaAsset: EditorMediaAsset = {
    id: 'asset-hero-video',
    storageKey: 'raw/user-1/asset-hero-video.mp4',
    originalFilename: 'hero_footage.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 24000000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 20000,
    width: 1920,
    height: 1080,
    fps: 30,
    createdAt: new Date().toISOString(),
  };

  function seedTimelineState() {
    const store = useEditorStore.getState();
    store.resetEditor();

    store.setProjectMedia([sampleMediaAsset]);

    store.setProject(
      {
        id: 'proj-9a-1',
        name: 'Timeline Core Test Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9a-1',
        projectId: 'proj-9a-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'timeline-9a-1',
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
                name: 'Intro Clip',
                clipType: 'video',
                mediaAssetId: 'asset-hero-video',
                startTimeMs: 2000,
                endTimeMs: 10000,
                sourceStartMs: 1000,
                sourceEndMs: 9000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
                slotBinding: 'hero_slot',
              } as any,
              {
                id: 'clip-v2',
                trackId: 'track-video-1',
                name: 'Outro Clip',
                clipType: 'video',
                mediaAssetId: 'asset-hero-video',
                startTimeMs: 12000,
                endTimeMs: 18000,
                sourceStartMs: 0,
                sourceEndMs: 6000,
                transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
                audioProperties: { volume: 1, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
          {
            id: 'track-audio-1',
            timelineId: 'timeline-9a-1',
            name: 'Audio Track 1',
            trackType: 'audio',
            orderIndex: 1,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-a1',
                trackId: 'track-audio-1',
                name: 'Background Music',
                clipType: 'audio',
                mediaAssetId: 'asset-bg-music',
                startTimeMs: 0,
                endTimeMs: 15000,
                sourceStartMs: 0,
                sourceEndMs: 15000,
                audioProperties: { volume: 0.8, fadeInMs: 0, fadeOutMs: 0, muted: false },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedTimelineState();
  });

  it('1. selecting a clip updates selectedClipId and preserves/syncs track selection without corrupting state', () => {
    const store = useEditorStore.getState();

    // Select clip-v1 via selectClip
    store.selectClip('clip-v1');
    expect(useEditorStore.getState().selectedClipId).toBe('clip-v1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-video-1');

    // Select clip-a1 via selectClipAndTrack
    store.selectClipAndTrack('clip-a1', 'track-audio-1');
    expect(useEditorStore.getState().selectedClipId).toBe('clip-a1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-audio-1');

    // Scrubbing empty space (setCurrentTimeMs) does not corrupt selection state
    store.setCurrentTimeMs(4500);
    expect(useEditorStore.getState().currentTimeMs).toBe(4500);
    expect(useEditorStore.getState().selectedClipId).toBe('clip-a1');
    expect(useEditorStore.getState().selectedTrackId).toBe('track-audio-1');
  });

  it('2. moving a clip horizontally updates startTimeMs and endTimeMs while preserving duration and source timing', () => {
    const store = useEditorStore.getState();

    // clip-v1 starts at 2000ms, ends at 10000ms (duration 8000ms), source 1000..9000
    store.moveClip('clip-v1', 5000);

    const updatedTrack = useEditorStore.getState().timeline!.tracks[0];
    const movedClip = updatedTrack.clips.find((c) => c.id === 'clip-v1') as any;

    expect(movedClip.startTimeMs).toBe(5000);
    expect(movedClip.endTimeMs).toBe(13000);
    expect(movedClip.endTimeMs - movedClip.startTimeMs).toBe(8000);
    expect(movedClip.sourceStartMs).toBe(1000);
    expect(movedClip.sourceEndMs).toBe(9000);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('3. moving a clip prevents negative start times and maintains sorted clip ordering', () => {
    const store = useEditorStore.getState();

    // Attempt to move clip-v1 to a negative timestamp (-3500ms)
    store.moveClip('clip-v1', -3500);

    const track = useEditorStore.getState().timeline!.tracks[0];
    const clipV1 = track.clips.find((c) => c.id === 'clip-v1')!;

    expect(clipV1.startTimeMs).toBe(0);
    expect(clipV1.endTimeMs).toBe(8000);

    // Move clip-v2 before clip-v1's later position and verify track clips stay ordered by startTimeMs
    store.moveClip('clip-v1', 15000);
    const reorderedClips = useEditorStore.getState().timeline!.tracks[0].clips;
    expect(reorderedClips[0].id).toBe('clip-v2');
    expect(reorderedClips[1].id).toBe('clip-v1');
  });

  it('4. trimming clip start adjusts timeline start, source media start, and resulting duration accurately', () => {
    const store = useEditorStore.getState();

    // clip-v1: startTimeMs=2000, endTimeMs=10000, sourceStartMs=1000, sourceEndMs=9000
    // Trim start inward by +1500ms -> newStartTimeMs = 3500
    store.trimClipStart('clip-v1', 3500);

    let clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1') as any;
    expect(clip.startTimeMs).toBe(3500);
    expect(clip.endTimeMs).toBe(10000);
    expect(clip.endTimeMs - clip.startTimeMs).toBe(6500);
    expect(clip.sourceStartMs).toBe(2500); // 1000 + 1500
    expect(clip.sourceEndMs).toBe(9000);   // 2500 + 6500

    // Trim start outward by -2000ms -> newStartTimeMs = 1500 (cannot go below sourceStartMs=0 which is at 1000ms)
    store.trimClipStart('clip-v1', 500);
    clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1') as any;
    expect(clip.startTimeMs).toBe(1000);
    expect(clip.sourceStartMs).toBe(0);
    expect(clip.endTimeMs).toBe(10000);
  });

  it('5. trimming clip end updates timeline end and sourceEndMs while respecting source media bounds', () => {
    const store = useEditorStore.getState();

    // clip-v1: startTimeMs=2000, endTimeMs=10000, sourceStartMs=1000, sourceEndMs=9000
    // Trim end inward to 7000ms (new duration = 5000ms)
    store.trimClipEnd('clip-v1', 7000);

    let clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1') as any;
    expect(clip.startTimeMs).toBe(2000);
    expect(clip.endTimeMs).toBe(7000);
    expect(clip.sourceStartMs).toBe(1000);
    expect(clip.sourceEndMs).toBe(6000);

    // Attempt to trim end beyond linked media asset duration (20000ms total, sourceStart=1000 -> max duration 19000 -> max endTime 21000)
    store.trimClipEnd('clip-v1', 50000);
    clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1') as any;
    expect(clip.endTimeMs).toBe(21000);
    expect(clip.sourceEndMs).toBe(20000);
  });

  it('6. prevents zero or negative duration when trimming start or end beyond bounds', () => {
    const store = useEditorStore.getState();

    // Attempt to trim start past endTimeMs (10000ms)
    store.trimClipStart('clip-v1', 15000);
    let clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1')!;
    expect(clip.endTimeMs - clip.startTimeMs).toBeGreaterThanOrEqual(100);
    expect(clip.startTimeMs).toBe(9900);
    expect(clip.endTimeMs).toBe(10000);

    // Reset and attempt to trim end before startTimeMs (2000ms)
    seedTimelineState();
    useEditorStore.getState().trimClipEnd('clip-v1', 1000);
    clip = useEditorStore.getState().timeline!.tracks[0].clips.find((c) => c.id === 'clip-v1')!;
    expect(clip.endTimeMs - clip.startTimeMs).toBeGreaterThanOrEqual(100);
    expect(clip.startTimeMs).toBe(2000);
    expect(clip.endTimeMs).toBe(2100);
  });

  it('7. splitting a clip at playhead divides timeline duration and source timing accurately into two clips', () => {
    const store = useEditorStore.getState();

    // clip-v1 spans 2000ms..10000ms (source 1000ms..9000ms)
    store.selectClip('clip-v1');
    store.setCurrentTimeMs(5000); // 3000ms into clip-v1
    store.splitClip();

    const videoClips = useEditorStore.getState().timeline!.tracks[0].clips as any[];
    // Originally 2 clips on track-video-1; after split there must be 3 clips
    expect(videoClips.length).toBe(3);

    const leftPart = videoClips[0];
    const rightPart = videoClips[1];
    const outroClip = videoClips[2];

    // Left half: 2000..5000 (duration 3000ms), source: 1000..4000
    expect(leftPart.startTimeMs).toBe(2000);
    expect(leftPart.endTimeMs).toBe(5000);
    expect(leftPart.sourceStartMs).toBe(1000);
    expect(leftPart.sourceEndMs).toBe(4000);

    // Right half: 5000..10000 (duration 5000ms), source: 4000..9000
    expect(rightPart.startTimeMs).toBe(5000);
    expect(rightPart.endTimeMs).toBe(10000);
    expect(rightPart.sourceStartMs).toBe(4000);
    expect(rightPart.sourceEndMs).toBe(9000);

    // Neighboring clip untouched
    expect(outroClip.id).toBe('clip-v2');
    expect(outroClip.startTimeMs).toBe(12000);
    expect(outroClip.endTimeMs).toBe(18000);
  });

  it('8. split preserves original mediaAssetId and relevant clip properties', () => {
    const store = useEditorStore.getState();

    store.selectClip('clip-v1');
    store.setCurrentTimeMs(6000);
    store.splitClip();

    const [leftPart, rightPart] = useEditorStore.getState().timeline!.tracks[0].clips as any[];
    expect(leftPart.mediaAssetId).toBe('asset-hero-video');
    expect(rightPart.mediaAssetId).toBe('asset-hero-video');
    expect(leftPart.trackId).toBe('track-video-1');
    expect(rightPart.trackId).toBe('track-video-1');
    expect(leftPart.clipType).toBe('video');
    expect(rightPart.clipType).toBe('video');
    expect(leftPart.slotBinding).toBe('hero_slot');
    expect(rightPart.slotBinding).toBe('hero_slot');
  });

  it('9. split assigns unique IDs to both resulting clips', () => {
    const store = useEditorStore.getState();

    store.selectClip('clip-v1');
    store.setCurrentTimeMs(6000);
    store.splitClip();

    const videoClips = useEditorStore.getState().timeline!.tracks[0].clips;
    const ids = videoClips.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(videoClips.length);
    expect(videoClips[0].id).not.toBe(videoClips[1].id);
    expect(videoClips[0].id).toBeTruthy();
    expect(videoClips[1].id).toBeTruthy();
  });

  it('10. split when playhead is outside the clip (or on boundary) does nothing and does not corrupt timeline', () => {
    const store = useEditorStore.getState();

    store.selectClip('clip-v1'); // 2000..10000

    // Playhead before clip (500ms)
    store.setCurrentTimeMs(500);
    store.splitClip();
    expect(useEditorStore.getState().timeline!.tracks[0].clips.length).toBe(2);

    // Playhead at exact clip start (2000ms)
    store.setCurrentTimeMs(2000);
    store.splitClip();
    expect(useEditorStore.getState().timeline!.tracks[0].clips.length).toBe(2);

    // Playhead after clip end (11000ms)
    store.setCurrentTimeMs(11000);
    store.splitClip();
    expect(useEditorStore.getState().timeline!.tracks[0].clips.length).toBe(2);

    const unchangedClip = useEditorStore.getState().timeline!.tracks[0].clips[0];
    expect(unchangedClip.id).toBe('clip-v1');
    expect(unchangedClip.startTimeMs).toBe(2000);
    expect(unchangedClip.endTimeMs).toBe(10000);
  });

  it('11. deleting a clip removes it from its track, preserves remaining clips, and clears selection', () => {
    const store = useEditorStore.getState();

    store.selectClip('clip-v1');
    expect(useEditorStore.getState().selectedClipId).toBe('clip-v1');

    store.deleteClip();

    const stateAfter = useEditorStore.getState();
    const videoClips = stateAfter.timeline!.tracks[0].clips;
    expect(videoClips.length).toBe(1);
    expect(videoClips[0].id).toBe('clip-v2');
    expect(stateAfter.selectedClipId).toBeNull();
  });

  it('12. deleting a timeline clip does NOT delete the underlying MediaAsset', () => {
    const store = useEditorStore.getState();

    expect(store.projectMedia.length).toBe(1);
    expect(store.projectMedia[0].id).toBe('asset-hero-video');

    store.deleteClip('clip-v1');
    store.deleteClip('clip-v2');

    const stateAfter = useEditorStore.getState();
    expect(stateAfter.timeline!.tracks[0].clips.length).toBe(0);
    // Underlying uploaded media asset remains intact in projectMedia
    expect(stateAfter.projectMedia.length).toBe(1);
    expect(stateAfter.projectMedia[0].id).toBe('asset-hero-video');
    expect(stateAfter.projectMedia[0].storageKey).toBe('raw/user-1/asset-hero-video.mp4');
  });

  it('13. editing one track does not corrupt another track', () => {
    const store = useEditorStore.getState();

    const audioTrackBefore = JSON.parse(
      JSON.stringify(store.timeline!.tracks.find((t) => t.id === 'track-audio-1')),
    );

    // Perform move, trim, split, and delete on track-video-1
    store.moveClip('clip-v1', 1000);
    store.trimClipStart('clip-v1', 1500);
    store.trimClipEnd('clip-v1', 8000);
    store.selectClip('clip-v1');
    store.setCurrentTimeMs(4000);
    store.splitClip();
    store.deleteClip('clip-v2');

    const audioTrackAfter = useEditorStore
      .getState()
      .timeline!.tracks.find((t) => t.id === 'track-audio-1');

    expect(audioTrackAfter).toEqual(audioTrackBefore);
  });

  it('14. canonical timeline state and snapshot remain valid after all editing operations', () => {
    const store = useEditorStore.getState();

    store.moveClip('clip-v1', 1000);
    store.trimClipEnd('clip-v1', 7000);
    store.selectClip('clip-v1');
    store.setCurrentTimeMs(4000);
    store.splitClip();

    const state = useEditorStore.getState();
    const snapshot = buildClientCanonicalSnapshot({
      projectId: state.currentProject.id,
      name: state.currentProject.name,
      aspectRatio: state.currentProject.aspectRatio,
      resolution: state.currentProject.resolution,
      fps: state.currentProject.fps,
      durationMs: state.timeline!.totalDurationMs,
      tracks: state.timeline!.tracks,
    });

    expect(snapshot.projectId).toBe('proj-9a-1');
    expect(snapshot.tracks.length).toBe(2);

    for (const track of snapshot.tracks) {
      expect(track.id).toBeTruthy();
      for (const clip of track.clips) {
        expect(clip.id).toBeTruthy();
        expect(clip.startTimeMs).toBeGreaterThanOrEqual(0);
        expect(clip.endTimeMs).toBeGreaterThan(clip.startTimeMs);
        expect((clip.sourceEndMs ?? 0) - (clip.sourceStartMs ?? 0)).toBe(
          clip.endTimeMs - clip.startTimeMs,
        );
      }
    }
  });
});
