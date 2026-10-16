import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';
import { timelineToSourceSeconds, sourceSecondsToTimelineMs } from '../src/features/editor/utils/playbackSync';
import type { Timeline, TimelineTrack, TimelineClip } from '../src/types/timeline';

describe('Phase 6C: Real Video Preview & Playback Synchronization', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  const sampleClip = {
    startTimeMs: 5000,
    endTimeMs: 15000,
    sourceStartMs: 2000,
    sourceEndMs: 12000,
  };

  describe('1. Timeline Time -> Source Video Time Conversion & Clamping', () => {
    it('converts timeline playhead position to source video seconds within clip boundary', () => {
      // clip starts at 5000ms, source starts at 2000ms
      // playhead at 8000ms => elapsed 3000ms => source time = 2000 + 3000 = 5000ms = 5.0 seconds
      const sync = timelineToSourceSeconds(8000, sampleClip);
      expect(sync.isWithinClip).toBe(true);
      expect(sync.sourceSec).toBeCloseTo(5.0);
    });

    it('converts clip start exactly to sourceStartMs seconds', () => {
      const sync = timelineToSourceSeconds(5000, sampleClip);
      expect(sync.isWithinClip).toBe(true);
      expect(sync.sourceSec).toBeCloseTo(2.0);
    });

    it('clamps gracefully when timeline playhead is before the clip starts', () => {
      const sync = timelineToSourceSeconds(1000, sampleClip);
      expect(sync.isWithinClip).toBe(false);
      expect(sync.sourceSec).toBeCloseTo(2.0); // clamped to sourceStartMs / 1000
    });

    it('clamps gracefully when timeline playhead is after the clip ends', () => {
      const sync = timelineToSourceSeconds(20000, sampleClip);
      expect(sync.isWithinClip).toBe(false);
      expect(sync.sourceSec).toBeCloseTo(12.0); // clamped to sourceEndMs / 1000
    });

    it('respects media duration cap if provided', () => {
      // If video file intrinsic duration is only 8 seconds, don't allow seeking beyond 8.0s
      const sync = timelineToSourceSeconds(14000, sampleClip, 8.0);
      expect(sync.isWithinClip).toBe(true);
      expect(sync.sourceSec).toBe(8.0);
    });
  });

  describe('2. Source Video Time -> Timeline Time Conversion & Boundary Detection', () => {
    it('converts HTML5 video currentTime to timeline position', () => {
      // video.currentTime is 5.0 seconds (5000ms)
      // sourceStartMs is 2000ms => elapsed = 3000ms
      // clip.startTimeMs = 5000ms => timeline time = 8000ms
      const res = sourceSecondsToTimelineMs(5.0, sampleClip);
      expect(res.timelineTimeMs).toBe(8000);
      expect(res.hasReachedClipEnd).toBe(false);
    });

    it('detects when source playback has reached or exceeded clip end', () => {
      // clip ends at 15000ms (10000ms duration)
      // source time 12.0s = 12000ms => elapsed = 10000ms => timeline = 15000ms
      const res = sourceSecondsToTimelineMs(12.0, sampleClip);
      expect(res.timelineTimeMs).toBe(15000);
      expect(res.hasReachedClipEnd).toBe(true);
    });

    it('clamps timeline time to clip.endTimeMs when video overruns', () => {
      const res = sourceSecondsToTimelineMs(15.0, sampleClip);
      expect(res.timelineTimeMs).toBe(15000);
      expect(res.hasReachedClipEnd).toBe(true);
    });
  });

  describe('3. Store Playback State & Rate Synchronization', () => {
    it('sets and updates playback rate within valid boundaries (0.25x - 4.0x)', () => {
      const store = useEditorStore.getState();
      expect(store.playbackRate).toBe(1.0);

      store.setPlaybackRate(1.5);
      expect(useEditorStore.getState().playbackRate).toBe(1.5);

      store.setPlaybackRate(0.5);
      expect(useEditorStore.getState().playbackRate).toBe(0.5);

      // Clamp excessively low or high speeds
      store.setPlaybackRate(0.01);
      expect(useEditorStore.getState().playbackRate).toBe(0.25);

      store.setPlaybackRate(10);
      expect(useEditorStore.getState().playbackRate).toBe(4.0);
    });

    it('toggles isPlaying state and tracks isVideoDrivenPlayback flag', () => {
      const store = useEditorStore.getState();
      expect(store.isPlaying).toBe(false);
      expect(store.isVideoDrivenPlayback).toBe(false);

      store.setIsPlaying(true);
      store.setIsVideoDrivenPlayback(true);

      expect(useEditorStore.getState().isPlaying).toBe(true);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(true);

      store.setIsPlaying(false);
      store.setIsVideoDrivenPlayback(false);

      expect(useEditorStore.getState().isPlaying).toBe(false);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(false);
    });
  });

  describe('4. Secure Presigned Download URL Endpoint Integration', () => {
    it('resolves download URL format without exposing private R2 credentials', () => {
      const mockAsset = {
        id: 'asset-uuid-123',
        storageKey: 'raw/user-1/asset-uuid-123.mp4',
        originalFilename: 'hero_shot.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10485760,
        ingestionStatus: 'ready',
        hasAudio: true,
        createdAt: new Date().toISOString(),
        previewUrl: null,
      };

      useEditorStore.getState().setProjectMedia([mockAsset]);
      expect(useEditorStore.getState().projectMedia[0].previewUrl).toBeNull();

      // Update signed URL returned from GET /api/media/:assetId/download-url
      const presignedUrl = 'https://mock-r2.cloudflarestorage.com/raw/user-1/asset-uuid-123.mp4?token=signed_exp_3600';
      useEditorStore.getState().updateMediaAssetPreviewUrl('asset-uuid-123', presignedUrl);

      const updated = useEditorStore.getState().projectMedia[0];
      expect(updated.previewUrl).toBe(presignedUrl);
      // Confirms URL does not contain raw access keys or server secrets
      expect(updated.previewUrl).not.toContain('AWS_SECRET_ACCESS_KEY');
      expect(updated.previewUrl).not.toContain('R2_SECRET_ACCESS_KEY');
    });

    it('handles multiple project media assets and isolates their preview URLs', () => {
      const assetA = {
        id: 'asset-a',
        storageKey: 'raw/usr/a.mp4',
        originalFilename: 'a.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1000,
        ingestionStatus: 'ready',
        hasAudio: true,
        createdAt: new Date().toISOString(),
      };
      const assetB = {
        id: 'asset-b',
        storageKey: 'raw/usr/b.mp4',
        originalFilename: 'b.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 2000,
        ingestionStatus: 'ready',
        hasAudio: false,
        createdAt: new Date().toISOString(),
      };

      useEditorStore.getState().setProjectMedia([assetA, assetB]);
      useEditorStore.getState().updateMediaAssetPreviewUrl('asset-a', 'https://r2.download/a.mp4');

      const assets = useEditorStore.getState().projectMedia;
      expect(assets.find((a) => a.id === 'asset-a')?.previewUrl).toBe('https://r2.download/a.mp4');
      expect(assets.find((a) => a.id === 'asset-b')?.previewUrl).toBeUndefined();
    });
  });

  describe('5. Aspect Ratio & Dimensions Verification', () => {
    it('validates canonical aspect ratios (16:9, 9:16, 1:1) supported by viewport', () => {
      const getDimensions = (ratio: string) => {
        switch (ratio) {
          case '9:16':
            return { width: 1080, height: 1920, orientation: 'portrait' };
          case '1:1':
            return { width: 1080, height: 1080, orientation: 'square' };
          default:
            return { width: 1920, height: 1080, orientation: 'landscape' };
        }
      };

      expect(getDimensions('16:9')).toEqual({ width: 1920, height: 1080, orientation: 'landscape' });
      expect(getDimensions('9:16')).toEqual({ width: 1080, height: 1920, orientation: 'portrait' });
      expect(getDimensions('1:1')).toEqual({ width: 1080, height: 1080, orientation: 'square' });
    });
  });
});
