import { describe, it, expect } from 'vitest';
import {
  calculateFrameAudioVolume,
  checkRenderSpecFeatureSupport,
  msToFrames,
} from '../workers/remotion/types';
import { buildCanonicalRenderSpec } from '../src/features/editor/utils/renderSpec';
import type { CanonicalRenderSpec } from '../src/types/render';

describe('Phase 11B-1: Independent Audio Tracks & Volume Envelopes', () => {
  describe('1. Frame-Accurate Volume Envelope Interpolation', () => {
    const fps = 30;
    const durationMs = 3000; // 3 seconds = 90 frames
    const durationFrames = msToFrames(durationMs, fps); // 90

    it('interpolates linear fade-in starting at 0 and reaching base volume at fadeInFrames', () => {
      const fadeInMs = 1000; // 30 frames
      const fadeInFrames = msToFrames(fadeInMs, fps); // 30
      const baseVolume = 0.8;

      // At start (frame 0), volume is 0
      expect(calculateFrameAudioVolume(0, durationFrames, baseVolume, false, fadeInFrames, 0)).toBe(0);

      // Halfway through fade-in (frame 15), volume is exactly 0.4
      expect(calculateFrameAudioVolume(15, durationFrames, baseVolume, false, fadeInFrames, 0)).toBe(0.4);

      // At end of fade-in (frame 30), volume reaches full baseVolume 0.8
      expect(calculateFrameAudioVolume(30, durationFrames, baseVolume, false, fadeInFrames, 0)).toBe(0.8);

      // Sustains baseVolume after fade-in
      expect(calculateFrameAudioVolume(45, durationFrames, baseVolume, false, fadeInFrames, 0)).toBe(0.8);
    });

    it('interpolates linear fade-out reducing volume toward 0 at durationFrames', () => {
      const fadeOutMs = 1000; // 30 frames
      const fadeOutFrames = msToFrames(fadeOutMs, fps); // 30
      const baseVolume = 1.0;

      // Before fade-out begins (frame 50), volume is full baseVolume 1.0
      expect(calculateFrameAudioVolume(50, durationFrames, baseVolume, false, 0, fadeOutFrames)).toBe(1.0);

      // Exactly when fade-out starts (frame 60 = 90 - 30)
      expect(calculateFrameAudioVolume(60, durationFrames, baseVolume, false, 0, fadeOutFrames)).toBe(1.0);

      // Halfway through fade-out (frame 75), volume is 0.5
      expect(calculateFrameAudioVolume(75, durationFrames, baseVolume, false, 0, fadeOutFrames)).toBe(0.5);

      // At end of duration (frame 90), volume reaches 0
      expect(calculateFrameAudioVolume(90, durationFrames, baseVolume, false, 0, fadeOutFrames)).toBe(0);
    });

    it('handles both fade-in and fade-out on the same clip', () => {
      const fadeInFrames = 30; // 1s
      const fadeOutFrames = 30; // 1s
      const baseVolume = 0.6;

      // Frame 0: 0
      expect(calculateFrameAudioVolume(0, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0);
      // Frame 30: 0.6
      expect(calculateFrameAudioVolume(30, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0.6);
      // Frame 45 (middle): 0.6
      expect(calculateFrameAudioVolume(45, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0.6);
      // Frame 60: 0.6
      expect(calculateFrameAudioVolume(60, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0.6);
      // Frame 75: 0.3
      expect(calculateFrameAudioVolume(75, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0.3);
      // Frame 90: 0
      expect(calculateFrameAudioVolume(90, durationFrames, baseVolume, false, fadeInFrames, fadeOutFrames)).toBe(0);
    });

    it('handles zero-duration fades safely without NaN or division by zero', () => {
      const baseVolume = 0.75;
      expect(calculateFrameAudioVolume(0, durationFrames, baseVolume, false, 0, 0)).toBe(0.75);
      expect(calculateFrameAudioVolume(45, durationFrames, baseVolume, false, 0, 0)).toBe(0.75);
      expect(calculateFrameAudioVolume(90, durationFrames, baseVolume, false, 0, 0)).toBe(0.75);
    });

    it('enforces mute state unconditionally', () => {
      const baseVolume = 1.0;
      expect(calculateFrameAudioVolume(0, durationFrames, baseVolume, true, 30, 30)).toBe(0);
      expect(calculateFrameAudioVolume(45, durationFrames, baseVolume, true, 30, 30)).toBe(0);
      expect(calculateFrameAudioVolume(90, durationFrames, baseVolume, true, 0, 0)).toBe(0);
    });

    it('safely handles overlapping fades without exceeding base volume', () => {
      // 60-frame clip where fadeIn is 50 frames and fadeOut is 50 frames (total 100 > 60)
      const shortClipFrames = 60;
      const longFade = 50;
      const baseVolume = 1.0;

      const vMid = calculateFrameAudioVolume(30, shortClipFrames, baseVolume, false, longFade, longFade);
      expect(vMid).toBeLessThanOrEqual(baseVolume);
      expect(vMid).toBeGreaterThan(0);
      expect(vMid).toBe(0.6); // at frame 30: inFactor=30/50=0.6, outFactor=(60-30)/50=0.6
    });

    it('clamps volume safely for out-of-bounds frame values', () => {
      expect(calculateFrameAudioVolume(-5, durationFrames, 1.0, false, 10, 10)).toBe(0);
      expect(calculateFrameAudioVolume(100, durationFrames, 1.0, false, 10, 10)).toBe(0);
    });
  });

  describe('2. Canonical RenderSpec Multi-Track Audio Integration', () => {
    it('generates canonical spec preserving video embedded audio and separate audio tracks', () => {
      const spec = buildCanonicalRenderSpec({
        project: {
          id: 'proj-audio-test',
          name: 'Multi-Track Audio Project',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 10000,
        },
        timeline: {
          totalDurationMs: 10000,
          tracks: [
            {
              id: 'track-v1',
              name: 'Main Video',
              trackType: 'video',
              orderIndex: 0,
              isMuted: false,
              volume: 1.0,
              clips: [
                {
                  id: 'clip-video-1',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 5000,
                  sourceStartMs: 1000,
                  sourceEndMs: 6000,
                  mediaAssetId: 'asset-video-1',
                  audioProperties: {
                    volume: 0.9,
                    muted: false,
                    fadeInMs: 500,
                    fadeOutMs: 1000,
                  },
                },
              ],
            },
            {
              id: 'track-a1',
              name: 'Background Music',
              trackType: 'audio',
              orderIndex: 1,
              isMuted: false,
              volume: 0.6,
              clips: [
                {
                  id: 'clip-audio-bgm',
                  clipType: 'audio',
                  startTimeMs: 0,
                  endTimeMs: 10000,
                  sourceStartMs: 0,
                  sourceEndMs: 10000,
                  mediaAssetId: 'asset-audio-bgm',
                  audioProperties: {
                    volume: 0.8,
                    muted: false,
                    fadeInMs: 2000,
                    fadeOutMs: 2000,
                  },
                },
              ],
            },
            {
              id: 'track-a2',
              name: 'Sound Effects (Overlapping)',
              trackType: 'audio',
              orderIndex: 2,
              isMuted: true,
              volume: 1.0,
              clips: [
                {
                  id: 'clip-audio-sfx',
                  clipType: 'audio',
                  startTimeMs: 3000,
                  endTimeMs: 6000,
                  sourceStartMs: 0,
                  sourceEndMs: 3000,
                  mediaAssetId: 'asset-audio-sfx',
                  volume: 1.0,
                  muted: true,
                },
              ],
            },
          ],
        },
        mediaAssets: [
          { id: 'asset-video-1', updatedAt: '2026-10-18T10:00:00Z' },
          { id: 'asset-audio-bgm', updatedAt: '2026-10-18T10:00:00Z' },
          { id: 'asset-audio-sfx', updatedAt: '2026-10-18T10:00:00Z' },
        ],
      });

      expect(spec.tracks).toHaveLength(3);
      expect(spec.tracks[0].trackType).toBe('video');
      expect(spec.tracks[1].trackType).toBe('audio');
      expect(spec.tracks[2].trackType).toBe('audio');

      // Check audio track 1 properties
      const bgmTrack = spec.tracks[1];
      expect(bgmTrack.name).toBe('Background Music');
      expect(bgmTrack.volume).toBe(0.6);
      expect(bgmTrack.isMuted).toBe(false);
      expect(bgmTrack.clips[0].audioProperties).toEqual({
        volume: 0.8,
        muted: false,
        fadeInMs: 2000,
        fadeOutMs: 2000,
      });

      // Check audio track 2 (muted track)
      const sfxTrack = spec.tracks[2];
      expect(sfxTrack.isMuted).toBe(true);
      expect(sfxTrack.clips[0].audioProperties?.muted).toBe(true);

      // Verify all 3 asset IDs were tracked in sourceAssetSignatures
      const assetIds = spec.sourceAssetSignatures.map((s) => s.assetId);
      expect(assetIds).toContain('asset-video-1');
      expect(assetIds).toContain('asset-audio-bgm');
      expect(assetIds).toContain('asset-audio-sfx');
    });
  });

  describe('3. Feature Support Reporting', () => {
    it('reports full feature support including independent audio tracks', () => {
      const spec: CanonicalRenderSpec = {
        projectId: 'p1',
        timelineHash: 'thash',
        renderSettings: { resolution: '1080p', fps: 30, watermark: false },
        aspectRatio: '16:9',
        durationMs: 5000,
        sourceAssetSignatures: [],
        tracks: [
          {
            id: 't-audio',
            name: 'BGM',
            trackType: 'audio',
            orderIndex: 0,
            isMuted: false,
            volume: 1,
            clips: [],
          },
        ],
        transitions: [],
      };

      const report = checkRenderSpecFeatureSupport(spec);
      expect(report.isFullySupported).toBe(true);
      expect(report.supportedFeatures).toContain(
        'Independent audio tracks with volume control and fade envelopes',
      );
      // Emits transparent note about advanced DSP (EQ, compression, EBU R128)
      expect(report.warnings.some((w) => w.includes('audio'))).toBe(true);
    });
  });
});
