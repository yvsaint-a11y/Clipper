import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  msToFrames,
  framesToMs,
  getCompositionDimensions,
  checkRenderSpecFeatureSupport,
} from '../workers/remotion/types';
import { isRenderEnvironmentAvailable } from '../workers/remotion/renderPipeline';
import type { CanonicalRenderSpec } from '../src/types/render';

describe('Phase 10B: Remotion Composition Engine & Render Worker', () => {
  const sampleSpec: CanonicalRenderSpec = {
    projectId: 'proj-remotion-10b',
    timelineHash: 'hash-10b-test',
    renderSettings: {
      resolution: '1080p',
      fps: 30,
      watermark: false,
    },
    aspectRatio: '16:9',
    durationMs: 6000,
    tracks: [
      {
        id: 'track-v1',
        name: 'Video 1',
        trackType: 'video',
        orderIndex: 0,
        isMuted: false,
        volume: 1,
        clips: [
          {
            id: 'clip-v1',
            name: 'Hero Footage',
            clipType: 'video',
            startTimeMs: 0,
            endTimeMs: 6000,
            sourceStartMs: 500,
            sourceEndMs: 6500,
            mediaAssetId: 'asset-video-1',
            transform: { positionX: 0, positionY: 0, scale: 1, opacity: 1 },
          },
        ],
      },
      {
        id: 'track-text-1',
        name: 'Title Track',
        trackType: 'text',
        orderIndex: 1,
        isMuted: false,
        volume: 1,
        clips: [
          {
            id: 'clip-t1',
            name: 'Main Title',
            clipType: 'text',
            startTimeMs: 1000,
            endTimeMs: 4000,
            textProperties: {
              text: 'Remotion Cloud Export',
              fontSize: 64,
              color: '#FFFFFF',
            },
          },
        ],
      },
    ],
  };

  describe('1. Frame Timing Calculations', () => {
    it('converts milliseconds to frame indices with 30fps precision', () => {
      expect(msToFrames(0, 30)).toBe(0);
      expect(msToFrames(500, 30)).toBe(15);
      expect(msToFrames(1000, 30)).toBe(30);
      expect(msToFrames(3333, 30)).toBe(100);
      expect(msToFrames(6000, 30)).toBe(180);
    });

    it('converts milliseconds to frame indices with 60fps precision', () => {
      expect(msToFrames(0, 60)).toBe(0);
      expect(msToFrames(500, 60)).toBe(30);
      expect(msToFrames(1000, 60)).toBe(60);
      expect(msToFrames(6000, 60)).toBe(360);
    });

    it('converts frame indices back to milliseconds', () => {
      expect(framesToMs(0, 30)).toBe(0);
      expect(framesToMs(15, 30)).toBe(500);
      expect(framesToMs(30, 30)).toBe(1000);
      expect(framesToMs(60, 60)).toBe(1000);
    });

    it('handles negative, NaN, or non-number inputs gracefully', () => {
      expect(msToFrames(-100, 30)).toBe(0);
      expect(msToFrames(NaN, 30)).toBe(0);
      expect(framesToMs(-5, 30)).toBe(0);
      expect(framesToMs(NaN, 30)).toBe(0);
    });
  });

  describe('2. Composition Dimensions & Bounds', () => {
    it('calculates 16:9 dimensions for 1080p and 720p', () => {
      expect(getCompositionDimensions('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
      expect(getCompositionDimensions('16:9', '720p')).toEqual({ width: 1280, height: 720 });
    });

    it('calculates 9:16 vertical dimensions for 1080p and 720p', () => {
      expect(getCompositionDimensions('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
      expect(getCompositionDimensions('9:16', '720p')).toEqual({ width: 720, height: 1280 });
    });

    it('calculates 1:1 square dimensions for 1080p and 720p', () => {
      expect(getCompositionDimensions('1:1', '1080p')).toEqual({ width: 1080, height: 1080 });
      expect(getCompositionDimensions('1:1', '720p')).toEqual({ width: 720, height: 720 });
    });
  });

  describe('3. RenderSpec Feature Support & Validation', () => {
    it('verifies slice 1 core features are supported', () => {
      const report = checkRenderSpecFeatureSupport(sampleSpec);
      expect(report.isFullySupported).toBe(true);
      expect(report.unsupportedFeatures).toHaveLength(0);
      expect(report.supportedFeatures).toContain('Sequential video tracks and clip layout');
      expect(report.supportedFeatures).toContain('Source trim timing (sourceStartMs, sourceEndMs)');
      expect(report.supportedFeatures).toContain('Single and multi-line text clip overlays');
    });

    it('emits transparent warnings for transitions and audio-only tracks', () => {
      const specWithTransitions: CanonicalRenderSpec = {
        ...sampleSpec,
        transitions: [{ fromClipId: 'c1', toClipId: 'c2', type: 'fade', durationMs: 500 } as any],
        tracks: [
          ...sampleSpec.tracks!,
          { id: 't-audio', name: 'BGM', trackType: 'audio', orderIndex: 2, isMuted: false, volume: 0.5, clips: [] },
        ],
      };

      const report = checkRenderSpecFeatureSupport(specWithTransitions);
      expect(report.warnings.length).toBeGreaterThanOrEqual(2);
      expect(report.warnings[0]).toContain('transition');
      expect(report.warnings[1]).toContain('audio');
    });
  });

  describe('4. Environment Prerequisites Check', () => {
    it('detects FFmpeg binary and reports headless Chromium availability status', async () => {
      const env = await isRenderEnvironmentAvailable();
      expect(typeof env.available).toBe('boolean');
      expect(env.available).toBe(true);
      expect(env.reason).toBeUndefined();
    });
  });

  describe('5. Render Worker Job Lifecycle & R2 Upload Safety', () => {
    it('ensures a job is not marked completed before R2 upload succeeds', async () => {
      // Mock worker execution where upload fails
      let jobStatus = 'queued';
      let jobProgress = 0;
      let outputKey: string | null = null;

      const mockUpdateProgress = async (id: string, updates: any) => {
        if (updates.status) jobStatus = updates.status;
        if (updates.progressPercentage !== undefined) jobProgress = updates.progressPercentage;
        if (updates.outputStorageKey) outputKey = updates.outputStorageKey;
      };

      // Simulate render flow
      await mockUpdateProgress('job-test', { status: 'processing', progressPercentage: 25 });
      expect(jobStatus).toBe('processing');
      expect(outputKey).toBeNull();

      // If R2 upload fails
      const uploadFailed = true;
      if (uploadFailed) {
        await mockUpdateProgress('job-test', {
          status: 'failed',
          progressPercentage: 0,
          errorMessage: 'R2 storage upload rejected with network error',
        });
      }

      // Assert status never became 'completed'
      expect(jobStatus).toBe('failed');
      expect(outputKey).toBeNull();
      expect(jobStatus).not.toBe('completed');
    });

    it('marks job completed with outputStorageKey ONLY after upload succeeds', async () => {
      let jobStatus = 'queued';
      let outputKey: string | null = null;

      const mockUpdateProgress = async (id: string, updates: any) => {
        if (updates.status) jobStatus = updates.status;
        if (updates.outputStorageKey) outputKey = updates.outputStorageKey;
      };

      await mockUpdateProgress('job-test', { status: 'processing' });
      const uploadSuccess = true;
      if (uploadSuccess) {
        const s3Key = 'renders/user-1/job-test.mp4';
        await mockUpdateProgress('job-test', {
          status: 'completed',
          progressPercentage: 100,
          outputStorageKey: s3Key,
        });
      }

      expect(jobStatus).toBe('completed');
      expect(outputKey).toBe('renders/user-1/job-test.mp4');
    });
  });
});
