import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  calculateEffectiveAudioVolume,
  DEFAULT_AUDIO_PROPERTIES,
  normalizeAudioClipProperties,
  toHtmlMediaElementVolume,
} from '../src/features/editor/utils/audioClip';
import { buildClientCanonicalSnapshot } from '../src/features/editor/utils/projectSnapshot';
import { buildCanonicalSnapshot } from '../server/services/projectSnapshotService';

describe('Phase 9F: Audio Clip Controls & Browser Preview Behavior', () => {
  const sampleAudioAsset: EditorMediaAsset = {
    id: 'asset-9f-audio',
    storageKey: 'raw/user-1/asset-9f-audio.mp3',
    originalFilename: 'soundtrack_theme.mp3',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 6400000,
    ingestionStatus: 'ready',
    hasAudio: true,
    durationMs: 30000,
    createdAt: new Date().toISOString(),
  };

  function seedAudioTimeline() {
    const store = useEditorStore.getState();
    store.resetEditor();
    store.setProjectMedia([sampleAudioAsset]);

    store.setProject(
      {
        id: 'proj-9f-1',
        name: 'Audio Editing Project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 30000,
      },
      {
        id: 'timeline-9f-1',
        projectId: 'proj-9f-1',
        totalDurationMs: 30000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-audio-1',
            timelineId: 'timeline-9f-1',
            name: 'Audio Track 1',
            trackType: 'audio',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [
              {
                id: 'clip-audio-1',
                trackId: 'track-audio-1',
                name: 'Main Soundtrack',
                clipType: 'audio',
                mediaAssetId: 'asset-9f-audio',
                startTimeMs: 2000,
                endTimeMs: 12000, // 10,000ms duration
                sourceStartMs: 1000,
                sourceEndMs: 11000,
                audioProperties: {
                  volume: 1,
                  fadeInMs: 0,
                  fadeOutMs: 0,
                  muted: false,
                },
              } as any,
              {
                id: 'clip-audio-2',
                trackId: 'track-audio-1',
                name: 'Secondary SFX',
                clipType: 'audio',
                mediaAssetId: 'asset-9f-audio',
                startTimeMs: 14000,
                endTimeMs: 18000,
                sourceStartMs: 0,
                sourceEndMs: 4000,
                audioProperties: {
                  volume: 0.8,
                  fadeInMs: 200,
                  fadeOutMs: 200,
                  muted: false,
                },
              } as any,
            ],
          },
        ],
      },
    );
  }

  beforeEach(() => {
    seedAudioTimeline();
  });

  it('1. selects an audio clip and synchronizes selectedClipId and selectedTrackId', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-audio-1');

    const state = useEditorStore.getState();
    expect(state.selectedClipId).toBe('clip-audio-1');
    expect(state.selectedTrackId).toBe('track-audio-1');
  });

  it('2. updates audio clip volume and clamps to [0, 2]', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-audio-1');

    store.updateAudioClip({ volume: 0.65 });
    let clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.volume).toBe(0.65);

    // Clamp above max (2.0)
    store.updateAudioClip('clip-audio-1', { volume: 3.5 });
    clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.volume).toBe(2);

    // Clamp below min (0.0)
    store.updateAudioClip('clip-audio-1', { volume: -0.5 });
    clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.volume).toBe(0);
  });

  it('3. toggles mute and unmute on the selected audio clip', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-audio-1');

    store.updateAudioClip({ muted: true });
    let clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.muted).toBe(true);
    expect(calculateEffectiveAudioVolume(clip, 5000)).toBe(0);

    store.updateAudioClip({ muted: false });
    clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.muted).toBe(false);
    expect(calculateEffectiveAudioVolume(clip, 5000)).toBe(1);
  });

  it('4. updates fadeInMs and fadeOutMs in milliseconds and clamps to [0, clipDurationMs]', () => {
    const store = useEditorStore.getState();
    // clip-audio-1 is 2000ms..12000ms (10000ms duration)
    store.updateAudioClip('clip-audio-1', { fadeInMs: 1500, fadeOutMs: 2500 });

    let clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.fadeInMs).toBe(1500);
    expect(clip.audioProperties.fadeOutMs).toBe(2500);

    // Negative fade values clamp to 0
    store.updateAudioClip('clip-audio-1', { fadeInMs: -400, fadeOutMs: -100 });
    clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.fadeInMs).toBe(0);
    expect(clip.audioProperties.fadeOutMs).toBe(0);

    // Fade values exceeding clip duration (10000ms) clamp to 10000ms
    store.updateAudioClip('clip-audio-1', { fadeInMs: 25000, fadeOutMs: 18000 });
    clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties.fadeInMs).toBe(10000);
    expect(clip.audioProperties.fadeOutMs).toBe(10000);
  });

  it('5. resets audio settings back to canonical defaults via resetAudioClipAudioSettings', () => {
    const store = useEditorStore.getState();
    store.selectClip('clip-audio-1');
    store.updateAudioClip({
      volume: 0.35,
      muted: true,
      fadeInMs: 1200,
      fadeOutMs: 1800,
    });

    store.resetAudioClipAudioSettings();

    const clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.audioProperties).toEqual(DEFAULT_AUDIO_PROPERTIES);
    expect(normalizeAudioClipProperties(clip)).toEqual({
      volume: 1,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  });

  it('6. computes deterministic effective preview volume across fade-in, steady state, fade-out, and outside clip bounds', () => {
    const store = useEditorStore.getState();
    // clip-audio-1: startTimeMs = 2000, endTimeMs = 12000 (duration = 10000)
    store.updateAudioClip('clip-audio-1', {
      volume: 0.8,
      muted: false,
      fadeInMs: 2000, // 2000ms..4000ms
      fadeOutMs: 2000, // 10000ms..12000ms
    });

    const clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;

    // Outside clip bounds -> 0
    expect(calculateEffectiveAudioVolume(clip, 1000)).toBe(0);
    expect(calculateEffectiveAudioVolume(clip, 13000)).toBe(0);

    // At clip start (2000ms, 0% of fadeIn) -> 0
    expect(calculateEffectiveAudioVolume(clip, 2000)).toBe(0);

    // Halfway through fade-in (3000ms, 50% of 2000ms fade-in) -> 0.8 * 0.5 = 0.4
    expect(calculateEffectiveAudioVolume(clip, 3000)).toBe(0.4);

    // Steady state (6000ms) -> 0.8
    expect(calculateEffectiveAudioVolume(clip, 6000)).toBe(0.8);

    // Halfway through fade-out (11000ms, 1000ms remaining of 2000ms fade-out) -> 0.8 * 0.5 = 0.4
    expect(calculateEffectiveAudioVolume(clip, 11000)).toBe(0.4);

    // At clip end (12000ms, 0ms remaining) -> 0
    expect(calculateEffectiveAudioVolume(clip, 12000)).toBe(0);

    // HTMLMediaElement volume clamping for unity+ gain
    expect(toHtmlMediaElementVolume(1.5)).toBe(1);
    expect(toHtmlMediaElementVolume(0.4)).toBe(0.4);
  });

  it('7. preserves source media timing and clip start/end timing when updating audio properties', () => {
    const store = useEditorStore.getState();
    store.updateAudioClip('clip-audio-1', {
      volume: 0.5,
      muted: true,
      fadeInMs: 800,
      fadeOutMs: 1200,
    });

    const clip = useEditorStore.getState().timeline!.tracks[0].clips[0] as any;
    expect(clip.startTimeMs).toBe(2000);
    expect(clip.endTimeMs).toBe(12000);
    expect(clip.sourceStartMs).toBe(1000);
    expect(clip.sourceEndMs).toBe(11000);
    expect(clip.mediaAssetId).toBe('asset-9f-audio');
  });

  it('8. marks project dirty and persists audio properties in canonical client and server snapshots', () => {
    const store = useEditorStore.getState();
    expect(store.isDirty).toBe(false);

    store.updateAudioClip('clip-audio-1', {
      volume: 0.75,
      muted: false,
      fadeInMs: 500,
      fadeOutMs: 900,
    });

    const state = useEditorStore.getState();
    expect(state.isDirty).toBe(true);

    const clientSnapshot = buildClientCanonicalSnapshot({
      projectId: state.currentProject.id,
      name: state.currentProject.name,
      aspectRatio: state.currentProject.aspectRatio,
      resolution: state.currentProject.resolution,
      fps: state.currentProject.fps,
      durationMs: state.timeline!.totalDurationMs,
      tracks: state.timeline!.tracks,
    });

    const serverSnapshot = buildCanonicalSnapshot({
      projectId: state.currentProject.id,
      name: state.currentProject.name,
      aspectRatio: state.currentProject.aspectRatio,
      resolution: state.currentProject.resolution,
      fps: state.currentProject.fps,
      durationMs: state.timeline!.totalDurationMs,
      tracks: state.timeline!.tracks,
    });

    expect(clientSnapshot.tracks[0].clips[0].audioProperties).toEqual({
      volume: 0.75,
      muted: false,
      fadeInMs: 500,
      fadeOutMs: 900,
    });
    expect(serverSnapshot.tracks[0].clips[0].audioProperties).toEqual({
      volume: 0.75,
      muted: false,
      fadeInMs: 500,
      fadeOutMs: 900,
    });
  });

  it('9. deleting an audio clip removes only that clip and does not delete or modify the underlying MediaAsset', () => {
    const store = useEditorStore.getState();
    const mediaBefore = JSON.parse(JSON.stringify(store.projectMedia));

    store.deleteClip('clip-audio-1');

    const state = useEditorStore.getState();
    const audioTrack = state.timeline!.tracks[0];
    expect(audioTrack.clips).toHaveLength(1);
    expect(audioTrack.clips[0].id).toBe('clip-audio-2');
    expect(state.projectMedia).toEqual(mediaBefore);
  });
});
