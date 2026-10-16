import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';
import {
  timelineToSourceSeconds,
  sourceSecondsToTimelineMs,
  isClipActiveAtTime,
  getSortedPlayableClips,
  resolveActiveClipAtTime,
  isEmptyTimeline,
  getPlayableTimelineDurationMs,
  hasTimelineEnded,
  isTimelineGapAtTime,
  getNextTimelineBoundary,
  resolveTimelinePlaybackState,
  resolveTimelineStep,
  resolveVideoClipTimeUpdate,
  resolveTimelineSeek,
  type PlayableClipTiming,
} from '../src/features/editor/utils/playbackSync';
import type { Timeline, VideoClip } from '../src/types/timeline';

function makeVideoClip(overrides: Partial<VideoClip> & { id: string; startTimeMs: number; endTimeMs: number }): VideoClip {
  const durationMs = overrides.endTimeMs - overrides.startTimeMs;
  return {
    id: overrides.id,
    trackId: overrides.trackId ?? 'track-video-1',
    name: overrides.name ?? `Clip ${overrides.id}`,
    clipType: 'video',
    mediaAssetId: overrides.mediaAssetId ?? `asset-${overrides.id}`,
    startTimeMs: overrides.startTimeMs,
    endTimeMs: overrides.endTimeMs,
    sourceStartMs: overrides.sourceStartMs ?? 0,
    sourceEndMs: overrides.sourceEndMs ?? durationMs,
    transform: overrides.transform ?? {
      x: 0,
      y: 0,
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
    crop: overrides.crop ?? { top: 0, right: 0, bottom: 0, left: 0 },
    audioProperties: overrides.audioProperties ?? {
      volume: 1,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    },
  };
}

describe('Phase 9H-1: Multi-Clip Playback Foundation', () => {
  describe('1. Resolving a single active clip', () => {
    it('resolves the active clip when playhead is inside its interval', () => {
      const clip = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 5000,
      });

      const active = resolveActiveClipAtTime([clip], 2500);
      expect(active).not.toBeNull();
      expect(active?.id).toBe('clip-1');

      const state = resolveTimelinePlaybackState([clip], 2500);
      expect(state.status).toBe('active-clip');
      expect(state.activeClip?.id).toBe('clip-1');
      expect(state.sourceTimeSec).toBeCloseTo(2.5);
      expect(state.isGap).toBe(false);
      expect(state.isEmpty).toBe(false);
      expect(state.isTimelineEnded).toBe(false);
      expect(state.isAtStart).toBe(false);
    });

    it('marks isAtStart true when resolving at 0ms', () => {
      const clip = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 5000,
      });

      const state = resolveTimelinePlaybackState([clip], 0);
      expect(state.status).toBe('active-clip');
      expect(state.activeClip?.id).toBe('clip-1');
      expect(state.isAtStart).toBe(true);
      expect(state.sourceTimeSec).toBeCloseTo(0);
    });
  });

  describe('2. Resolving the correct clip among multiple clips', () => {
    it('selects the matching clip across multiple non-overlapping clips regardless of input array order', () => {
      const clipA = makeVideoClip({ id: 'clip-a', startTimeMs: 0, endTimeMs: 3000 });
      const clipB = makeVideoClip({ id: 'clip-b', startTimeMs: 3000, endTimeMs: 7000 });
      const clipC = makeVideoClip({ id: 'clip-c', startTimeMs: 9000, endTimeMs: 14000 });

      // Pass unsorted order to verify deterministic resolution
      const unsortedClips = [clipC, clipA, clipB];

      expect(resolveActiveClipAtTime(unsortedClips, 1200)?.id).toBe('clip-a');
      expect(resolveActiveClipAtTime(unsortedClips, 4500)?.id).toBe('clip-b');
      expect(resolveActiveClipAtTime(unsortedClips, 11500)?.id).toBe('clip-c');
    });

    it('resolves clips from a canonical Timeline object with tracks', () => {
      const clipA = makeVideoClip({ id: 'clip-a', startTimeMs: 0, endTimeMs: 4000 });
      const clipB = makeVideoClip({ id: 'clip-b', startTimeMs: 5000, endTimeMs: 9000 });

      const timeline: Timeline = {
        id: 'tl-1',
        projectId: 'proj-1',
        totalDurationMs: 9000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'tl-1',
            name: 'Video 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [clipA, clipB],
          },
        ],
      };

      expect(resolveActiveClipAtTime(timeline, 2000, { trackType: 'video' })?.id).toBe('clip-a');
      expect(resolveActiveClipAtTime(timeline, 6500, { trackType: 'video' })?.id).toBe('clip-b');
    });
  });

  describe('3. Returning a gap state between clips', () => {
    it('returns an explicit gap state when playhead is between two clips', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 6000, endTimeMs: 10000 });
      const clips = [clip1, clip2];

      expect(resolveActiveClipAtTime(clips, 5000)).toBeNull();
      expect(isTimelineGapAtTime(clips, 5000)).toBe(true);

      const state = resolveTimelinePlaybackState(clips, 5000);
      expect(state.status).toBe('gap');
      expect(state.isGap).toBe(true);
      expect(state.activeClip).toBeNull();
      expect(state.sourceTimeSec).toBeNull();
      expect(state.isTimelineEnded).toBe(false);
      expect(state.isEmpty).toBe(false);
      expect(state.nextBoundaryMs).toBe(6000);
      expect(state.nextClip?.id).toBe('clip-2');
    });

    it('detects a leading gap when the first clip starts after 0ms', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 2000, endTimeMs: 6000 });

      expect(isTimelineGapAtTime([clip1], 500)).toBe(true);
      const state = resolveTimelinePlaybackState([clip1], 0);
      expect(state.status).toBe('gap');
      expect(state.isGap).toBe(true);
      expect(state.isAtStart).toBe(true);
      expect(state.activeClip).toBeNull();
      expect(state.nextBoundaryMs).toBe(2000);
      expect(state.nextClip?.id).toBe('clip-1');
    });
  });

  describe('4. Handling exact clip start boundaries', () => {
    it('treats clip.startTimeMs as inclusive (clip is active at its exact start boundary)', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 2000, endTimeMs: 5000, sourceStartMs: 1000, sourceEndMs: 4000 });

      expect(isClipActiveAtTime(clip1, 1999)).toBe(false);
      expect(isClipActiveAtTime(clip1, 2000)).toBe(true);
      expect(resolveActiveClipAtTime([clip1], 2000)?.id).toBe('clip-1');

      const state = resolveTimelinePlaybackState([clip1], 2000);
      expect(state.status).toBe('active-clip');
      expect(state.activeClip?.id).toBe('clip-1');
      expect(state.sourceTimeSec).toBeCloseTo(1.0);
    });
  });

  describe('5. Handling exact clip end boundaries', () => {
    it('treats clip.endTimeMs as exclusive (clip does not remain active at its exact end boundary)', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 6000, endTimeMs: 10000 });
      const clips = [clip1, clip2];

      expect(isClipActiveAtTime(clip1, 3999)).toBe(true);
      expect(isClipActiveAtTime(clip1, 4000)).toBe(false);

      // At exact 4000ms (with a gap from 4000ms to 6000ms), clip1 must NOT remain active
      expect(resolveActiveClipAtTime(clips, 4000)).toBeNull();
      const stateAtClip1End = resolveTimelinePlaybackState(clips, 4000);
      expect(stateAtClip1End.status).toBe('gap');
      expect(stateAtClip1End.activeClip).toBeNull();
      expect(stateAtClip1End.isGap).toBe(true);
    });
  });

  describe('6. Finding the next timeline boundary', () => {
    it('finds the active clip end when inside an active clip, and the next clip start when inside a gap', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 1000, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 6000, endTimeMs: 9000 });
      const clips = [clip1, clip2];

      // Before first clip (at 0ms): next boundary is clip-1 start at 1000ms
      const b0 = getNextTimelineBoundary(clips, 0);
      expect(b0.boundaryTimeMs).toBe(1000);
      expect(b0.boundaryType).toBe('clip-start');
      expect(b0.clip?.id).toBe('clip-1');

      // Inside clip-1 (at 2500ms): next boundary is clip-1 end at 4000ms
      const b1 = getNextTimelineBoundary(clips, 2500);
      expect(b1.boundaryTimeMs).toBe(4000);
      expect(b1.boundaryType).toBe('clip-end');
      expect(b1.clip?.id).toBe('clip-1');

      // At exact clip-1 end / gap start (4000ms): next boundary is clip-2 start at 6000ms
      const b2 = getNextTimelineBoundary(clips, 4000);
      expect(b2.boundaryTimeMs).toBe(6000);
      expect(b2.boundaryType).toBe('clip-start');
      expect(b2.clip?.id).toBe('clip-2');

      // Inside clip-2 (at 7000ms): next boundary is clip-2 end at 9000ms
      const b3 = getNextTimelineBoundary(clips, 7000);
      expect(b3.boundaryTimeMs).toBe(9000);
      expect(b3.boundaryType).toBe('clip-end');
      expect(b3.clip?.id).toBe('clip-2');
    });
  });

  describe('7. Never moving the calculated boundary backwards', () => {
    it('guarantees boundaryTimeMs is always >= currentTimeMs across the entire timeline and past the end', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 3000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 4500, endTimeMs: 8000 });
      const clips = [clip1, clip2];

      const testTimestamps = [0, 500, 2999, 3000, 3500, 4500, 6000, 7999, 8000, 9500, 15000];
      for (const t of testTimestamps) {
        const boundary = getNextTimelineBoundary(clips, t);
        expect(boundary.boundaryTimeMs).toBeGreaterThanOrEqual(t);
      }

      // Past timeline end: returns currentTimeMs with boundaryType 'none'
      const pastEnd = getNextTimelineBoundary(clips, 12000);
      expect(pastEnd.boundaryTimeMs).toBe(12000);
      expect(pastEnd.boundaryType).toBe('none');
    });
  });

  describe('8. Detecting the end of the timeline', () => {
    it('detects when playhead reaches or exceeds the effective timeline duration', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 4000, endTimeMs: 9000 });
      const clips = [clip1, clip2];

      expect(getPlayableTimelineDurationMs(clips)).toBe(9000);
      expect(hasTimelineEnded(clips, 0)).toBe(false);
      expect(hasTimelineEnded(clips, 8999)).toBe(false);
      expect(hasTimelineEnded(clips, 9000)).toBe(true);
      expect(hasTimelineEnded(clips, 10500)).toBe(true);

      const endState = resolveTimelinePlaybackState(clips, 9000);
      expect(endState.status).toBe('timeline-end');
      expect(endState.isTimelineEnded).toBe(true);
      expect(endState.activeClip).toBeNull();
      expect(endState.isGap).toBe(false);
      expect(endState.isEmpty).toBe(false);
    });

    it('respects explicit projectDurationMs when larger than the last clip endTimeMs', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 5000 });

      expect(getPlayableTimelineDurationMs([clip1], 8000)).toBe(8000);
      expect(hasTimelineEnded([clip1], 5000, 8000)).toBe(false);
      expect(isTimelineGapAtTime([clip1], 5000, 8000)).toBe(true);
      expect(hasTimelineEnded([clip1], 8000, 8000)).toBe(true);
    });
  });

  describe('9. Handling an empty timeline', () => {
    it('resolves an empty timeline safely without returning any arbitrary clip', () => {
      expect(isEmptyTimeline([])).toBe(true);
      expect(isEmptyTimeline(null)).toBe(true);
      expect(isEmptyTimeline({ totalDurationMs: 0, tracks: [] })).toBe(true);

      expect(resolveActiveClipAtTime([], 0)).toBeNull();
      expect(isTimelineGapAtTime([], 0)).toBe(false);
      expect(hasTimelineEnded([], 0)).toBe(false);

      const state = resolveTimelinePlaybackState([], 0);
      expect(state.status).toBe('empty');
      expect(state.isEmpty).toBe(true);
      expect(state.activeClip).toBeNull();
      expect(state.sourceTimeSec).toBeNull();
      expect(state.isGap).toBe(false);
      expect(state.isTimelineEnded).toBe(false);
      expect(state.isAtStart).toBe(true);
      expect(state.effectiveDurationMs).toBe(0);
    });
  });

  describe('10. Preserving sourceStartMs and sourceEndMs', () => {
    it('computes accurate source time using sourceStartMs and never mutates clip sourceStartMs or sourceEndMs', () => {
      const clip1 = makeVideoClip({
        id: 'clip-trimmed',
        startTimeMs: 2000,
        endTimeMs: 7000,
        sourceStartMs: 3500,
        sourceEndMs: 8500,
      });

      const snapshotBefore = { ...clip1 };
      const state = resolveTimelinePlaybackState([clip1], 4000);

      expect(state.activeClip?.id).toBe('clip-trimmed');
      // 4000ms - 2000ms = 2000ms elapsed in clip + 3500ms sourceStartMs = 5500ms = 5.5s
      expect(state.sourceTimeSec).toBeCloseTo(5.5);

      // Verify sourceStartMs and sourceEndMs are completely preserved and unmutated
      expect(clip1.sourceStartMs).toBe(snapshotBefore.sourceStartMs);
      expect(clip1.sourceEndMs).toBe(snapshotBefore.sourceEndMs);
      expect(state.activeClip?.sourceStartMs).toBe(3500);
      expect(state.activeClip?.sourceEndMs).toBe(8500);

      // Also verify reverse conversion preserves boundaries
      const reverse = sourceSecondsToTimelineMs(5.5, clip1);
      expect(reverse.timelineTimeMs).toBe(4000);
      expect(reverse.hasReachedClipEnd).toBe(false);
    });
  });

  describe('11. Preserving clip startTimeMs and endTimeMs', () => {
    it('does not mutate clip startTimeMs, endTimeMs, or input clip array order during resolution', () => {
      const clipB = makeVideoClip({ id: 'clip-b', startTimeMs: 5000, endTimeMs: 9000 });
      const clipA = makeVideoClip({ id: 'clip-a', startTimeMs: 1000, endTimeMs: 4000 });
      const inputArray: PlayableClipTiming[] = [clipB, clipA];

      const sorted = getSortedPlayableClips(inputArray);
      expect(sorted.map((c) => c.id)).toEqual(['clip-a', 'clip-b']);
      // Input array order must remain untouched
      expect(inputArray.map((c) => c.id)).toEqual(['clip-b', 'clip-a']);

      resolveTimelinePlaybackState(inputArray, 2500);
      getNextTimelineBoundary(inputArray, 2500);
      isTimelineGapAtTime(inputArray, 4500);

      expect(clipA.startTimeMs).toBe(1000);
      expect(clipA.endTimeMs).toBe(4000);
      expect(clipB.startTimeMs).toBe(5000);
      expect(clipB.endTimeMs).toBe(9000);
    });
  });

  describe('12. Handling adjacent clips correctly', () => {
    it('switches immediately from clip 1 to clip 2 at their shared boundary without a false gap', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 5000,
        sourceStartMs: 0,
        sourceEndMs: 5000,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        startTimeMs: 5000,
        endTimeMs: 10000,
        sourceStartMs: 2000,
        sourceEndMs: 7000,
      });
      const clips = [clip1, clip2];

      // Just before boundary (4999ms): clip-1 is active
      const beforeBoundary = resolveTimelinePlaybackState(clips, 4999);
      expect(beforeBoundary.status).toBe('active-clip');
      expect(beforeBoundary.activeClip?.id).toBe('clip-1');
      expect(beforeBoundary.isGap).toBe(false);
      expect(beforeBoundary.nextBoundaryMs).toBe(5000);

      // Exactly at boundary (5000ms): clip-2 is active immediately at its sourceStartMs (2.0s), no gap
      const atBoundary = resolveTimelinePlaybackState(clips, 5000);
      expect(atBoundary.status).toBe('active-clip');
      expect(atBoundary.activeClip?.id).toBe('clip-2');
      expect(atBoundary.isGap).toBe(false);
      expect(atBoundary.sourceTimeSec).toBeCloseTo(2.0);
      expect(atBoundary.nextBoundaryMs).toBe(10000);

      // Inside clip-2 (7500ms): clip-2 is active at 4.5s source time
      const inClip2 = resolveTimelinePlaybackState(clips, 7500);
      expect(inClip2.status).toBe('active-clip');
      expect(inClip2.activeClip?.id).toBe('clip-2');
      expect(inClip2.sourceTimeSec).toBeCloseTo(4.5);

      // At end of clip-2 (10000ms): timeline has ended
      const atEnd = resolveTimelinePlaybackState(clips, 10000);
      expect(atEnd.status).toBe('timeline-end');
      expect(atEnd.activeClip).toBeNull();
      expect(atEnd.isTimelineEnded).toBe(true);
    });
  });

  describe('13. Phase 9H-2A: Playback Step, Video TimeUpdate & Seek Helpers', () => {
    it('resolveTimelineStep snaps cleanly onto an adjacent clip boundary and switches to the next clip at its sourceStartMs', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 4000,
        sourceStartMs: 0,
        sourceEndMs: 4000,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        startTimeMs: 4000,
        endTimeMs: 9000,
        sourceStartMs: 1500,
        sourceEndMs: 6500,
      });
      const clips = [clip1, clip2];

      // Step from 3980ms by 50ms: must snap to exact boundary at 4000ms so clip-2 starts at its exact sourceStartMs (1.5s)
      const stepResult = resolveTimelineStep(clips, 3980, 50);
      expect(stepResult.currentTimeMs).toBe(4000);
      expect(stepResult.activeClip?.id).toBe('clip-2');
      expect(stepResult.sourceTimeSec).toBeCloseTo(1.5);
      expect(stepResult.isGap).toBe(false);
      expect(stepResult.shouldStopPlayback).toBe(false);
      expect(stepResult.shouldDriveWithVideo).toBe(true);
      expect(stepResult.didSwitchClip).toBe(true);
      expect(stepResult.previousClipId).toBe('clip-1');
    });

    it('resolveTimelineStep handles playback entering a gap and stepping across a gap to the next clip start', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 3000 });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        startTimeMs: 5000,
        endTimeMs: 8000,
        sourceStartMs: 2000,
        sourceEndMs: 5000,
      });
      const clips = [clip1, clip2];

      // Step from 2980ms by 40ms into the gap boundary at 3000ms
      const enterGap = resolveTimelineStep(clips, 2980, 40);
      expect(enterGap.currentTimeMs).toBe(3000);
      expect(enterGap.activeClip).toBeNull();
      expect(enterGap.isGap).toBe(true);
      expect(enterGap.shouldStopPlayback).toBe(false);
      expect(enterGap.shouldDriveWithVideo).toBe(false);
      expect(enterGap.didSwitchClip).toBe(true);
      expect(enterGap.previousClipId).toBe('clip-1');

      // Step inside gap from 3000ms by 500ms -> 3500ms (still in gap)
      const inGap = resolveTimelineStep(clips, 3000, 500);
      expect(inGap.currentTimeMs).toBe(3500);
      expect(inGap.activeClip).toBeNull();
      expect(inGap.isGap).toBe(true);
      expect(inGap.shouldStopPlayback).toBe(false);
      expect(inGap.shouldDriveWithVideo).toBe(false);

      // Step from 4970ms by 60ms -> snaps to clip-2 start at 5000ms
      const exitGapToClip2 = resolveTimelineStep(clips, 4970, 60);
      expect(exitGapToClip2.currentTimeMs).toBe(5000);
      expect(exitGapToClip2.activeClip?.id).toBe('clip-2');
      expect(exitGapToClip2.sourceTimeSec).toBeCloseTo(2.0);
      expect(exitGapToClip2.isGap).toBe(false);
      expect(exitGapToClip2.shouldStopPlayback).toBe(false);
      expect(exitGapToClip2.shouldDriveWithVideo).toBe(true);
      expect(exitGapToClip2.didSwitchClip).toBe(true);
      expect(exitGapToClip2.previousClipId).toBeNull();
    });

    it('resolveTimelineStep stops playback cleanly at the effective timeline end', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 4000, endTimeMs: 7000 });
      const clips = [clip1, clip2];

      const atEndStep = resolveTimelineStep(clips, 6975, 50);
      expect(atEndStep.currentTimeMs).toBe(7000);
      expect(atEndStep.activeClip).toBeNull();
      expect(atEndStep.isGap).toBe(false);
      expect(atEndStep.shouldStopPlayback).toBe(true);
      expect(atEndStep.shouldDriveWithVideo).toBe(false);
      expect(atEndStep.resolution.status).toBe('timeline-end');
      expect(atEndStep.resolution.isTimelineEnded).toBe(true);
    });

    it('resolveVideoClipTimeUpdate transitions seamlessly at a clip boundary (adjacent clip, gap, and timeline end)', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 4000,
        sourceStartMs: 1000,
        sourceEndMs: 5000,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        startTimeMs: 4000,
        endTimeMs: 8000,
        sourceStartMs: 500,
        sourceEndMs: 4500,
      });
      const clip3 = makeVideoClip({
        id: 'clip-3',
        startTimeMs: 10000,
        endTimeMs: 13000,
        sourceStartMs: 0,
        sourceEndMs: 3000,
      });
      const clips = [clip1, clip2, clip3];

      // 1. Mid-clip1 update at 2.5s source time -> 1500ms timeline time
      const midClip1 = resolveVideoClipTimeUpdate(clips, clip1, 2.5);
      expect(midClip1.timelineTimeMs).toBe(1500);
      expect(midClip1.hasReachedClipEnd).toBe(false);
      expect(midClip1.activeClip?.id).toBe('clip-1');
      expect(midClip1.shouldStopPlayback).toBe(false);
      expect(midClip1.shouldDriveWithVideo).toBe(true);
      expect(midClip1.didSwitchClip).toBe(false);

      // 2. Clip1 reaches its sourceEndMs (5.0s) -> transitions immediately to adjacent clip-2 at 4000ms (sourceTimeSec 0.5s)
      const atClip1End = resolveVideoClipTimeUpdate(clips, clip1, 5.0);
      expect(atClip1End.timelineTimeMs).toBe(4000);
      expect(atClip1End.hasReachedClipEnd).toBe(true);
      expect(atClip1End.activeClip?.id).toBe('clip-2');
      expect(atClip1End.sourceTimeSec).toBeCloseTo(0.5);
      expect(atClip1End.isGap).toBe(false);
      expect(atClip1End.shouldStopPlayback).toBe(false);
      expect(atClip1End.shouldDriveWithVideo).toBe(true);
      expect(atClip1End.didSwitchClip).toBe(true);

      // 3. Clip2 reaches its sourceEndMs (4.5s) -> enters gap at 8000ms (before clip-3 at 10000ms)
      const atClip2End = resolveVideoClipTimeUpdate(clips, clip2, 4.5);
      expect(atClip2End.timelineTimeMs).toBe(8000);
      expect(atClip2End.hasReachedClipEnd).toBe(true);
      expect(atClip2End.activeClip).toBeNull();
      expect(atClip2End.isGap).toBe(true);
      expect(atClip2End.shouldStopPlayback).toBe(false);
      expect(atClip2End.shouldDriveWithVideo).toBe(false);
      expect(atClip2End.didSwitchClip).toBe(true);

      // 4. Clip3 reaches its sourceEndMs (3.0s) -> reaches effective timeline end at 13000ms and stops playback
      const atClip3End = resolveVideoClipTimeUpdate(clips, clip3, 3.0);
      expect(atClip3End.timelineTimeMs).toBe(13000);
      expect(atClip3End.hasReachedClipEnd).toBe(true);
      expect(atClip3End.activeClip).toBeNull();
      expect(atClip3End.isGap).toBe(false);
      expect(atClip3End.shouldStopPlayback).toBe(true);
      expect(atClip3End.shouldDriveWithVideo).toBe(false);
    });

    it('resolveVideoClipTimeUpdate handles when no playable clip exists on the timeline', () => {
      const orphanClip = makeVideoClip({ id: 'orphan', startTimeMs: 0, endTimeMs: 3000 });

      // Empty timeline with null currentActiveClip
      const emptyWithNullClip = resolveVideoClipTimeUpdate([], null, 1.25);
      expect(emptyWithNullClip.resolution.status).toBe('empty');
      expect(emptyWithNullClip.resolution.isEmpty).toBe(true);
      expect(emptyWithNullClip.activeClip).toBeNull();
      expect(emptyWithNullClip.shouldStopPlayback).toBe(true);
      expect(emptyWithNullClip.shouldDriveWithVideo).toBe(false);

      // Empty timeline with a stale clip reference
      const emptyWithStaleClip = resolveVideoClipTimeUpdate([], orphanClip, 1.25);
      expect(emptyWithStaleClip.resolution.status).toBe('empty');
      expect(emptyWithStaleClip.resolution.isEmpty).toBe(true);
      expect(emptyWithStaleClip.activeClip).toBeNull();
      expect(emptyWithStaleClip.shouldStopPlayback).toBe(true);
      expect(emptyWithStaleClip.shouldDriveWithVideo).toBe(false);
    });

    it('resolveTimelineSeek resolves inside a clip with accurate sourceTimeSec', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        startTimeMs: 0,
        endTimeMs: 4000,
        sourceStartMs: 500,
        sourceEndMs: 4500,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        startTimeMs: 6000,
        endTimeMs: 10000,
        sourceStartMs: 2000,
        sourceEndMs: 6000,
      });
      const clips = [clip1, clip2];

      const seekInClip2 = resolveTimelineSeek(clips, 7500);
      expect(seekInClip2.status).toBe('active-clip');
      expect(seekInClip2.currentTimeMs).toBe(7500);
      expect(seekInClip2.activeClip?.id).toBe('clip-2');
      expect(seekInClip2.sourceTimeSec).toBeCloseTo(3.5);
      expect(seekInClip2.isGap).toBe(false);
      expect(seekInClip2.isTimelineEnded).toBe(false);
    });

    it('resolveTimelineSeek resolves inside a gap without selecting an unrelated clip', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 6000, endTimeMs: 10000 });
      const clips = [clip1, clip2];

      const seekInGap = resolveTimelineSeek(clips, 5000);
      expect(seekInGap.status).toBe('gap');
      expect(seekInGap.currentTimeMs).toBe(5000);
      expect(seekInGap.activeClip).toBeNull();
      expect(seekInGap.sourceTimeSec).toBeNull();
      expect(seekInGap.isGap).toBe(true);
      expect(seekInGap.isTimelineEnded).toBe(false);
      expect(seekInGap.nextBoundaryMs).toBe(6000);
      expect(seekInGap.nextClip?.id).toBe('clip-2');
    });

    it('resolveTimelineSeek resolves and clamps at the timeline end', () => {
      const clip1 = makeVideoClip({ id: 'clip-1', startTimeMs: 0, endTimeMs: 4000 });
      const clip2 = makeVideoClip({ id: 'clip-2', startTimeMs: 4000, endTimeMs: 9000 });
      const clips = [clip1, clip2];

      // Seeking past the end (12000ms) clamps to effectiveDurationMs (9000ms) and reports timeline-end
      const seekAtEnd = resolveTimelineSeek(clips, 12000);
      expect(seekAtEnd.status).toBe('timeline-end');
      expect(seekAtEnd.currentTimeMs).toBe(9000);
      expect(seekAtEnd.effectiveDurationMs).toBe(9000);
      expect(seekAtEnd.activeClip).toBeNull();
      expect(seekAtEnd.sourceTimeSec).toBeNull();
      expect(seekAtEnd.isGap).toBe(false);
      expect(seekAtEnd.isTimelineEnded).toBe(true);
    });
  });

  describe('14. Phase 9H-2C: Continuous Multi-Clip Playback & Store Integration', () => {
    const assetA: EditorMediaAsset = {
      id: 'asset-clip-1',
      storageKey: 'raw/user-1/asset-clip-1.mp4',
      originalFilename: 'clip_one.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 10000000,
      ingestionStatus: 'ready',
      hasAudio: true,
      durationMs: 10000,
      previewUrl: 'https://cdn.example.com/clip_one.mp4',
      createdAt: new Date().toISOString(),
    };

    const assetB: EditorMediaAsset = {
      id: 'asset-clip-2',
      storageKey: 'raw/user-1/asset-clip-2.mp4',
      originalFilename: 'clip_two.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 12000000,
      ingestionStatus: 'ready',
      hasAudio: true,
      durationMs: 12000,
      previewUrl: 'https://cdn.example.com/clip_two.mp4',
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      useEditorStore.getState().resetEditor();
    });

    it('synchronizes store playback state across adjacent clips (clip-1 -> clip-2) and switches active media asset seamlessly', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        mediaAssetId: assetA.id,
        startTimeMs: 0,
        endTimeMs: 4000,
        sourceStartMs: 1000,
        sourceEndMs: 5000,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        mediaAssetId: assetB.id,
        startTimeMs: 4000,
        endTimeMs: 9000,
        sourceStartMs: 500,
        sourceEndMs: 5500,
      });

      const timeline: Timeline = {
        id: 'tl-9h-adj',
        projectId: 'proj-9h-adj',
        totalDurationMs: 9000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'tl-9h-adj',
            name: 'Video 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [clip1, clip2],
          },
        ],
      };

      const store = useEditorStore.getState();
      store.setProject(
        {
          id: 'proj-9h-adj',
          name: 'Adjacent Multi-Clip Project',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 9000,
        },
        timeline,
      );
      store.setProjectMedia([assetA, assetB]);

      // Start playback at 0ms
      store.setCurrentTimeMs(0);
      store.setIsPlaying(true);
      store.setIsVideoDrivenPlayback(true);

      const initialState = resolveTimelinePlaybackState(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        useEditorStore.getState().currentProject?.durationMs,
      );
      expect(initialState.activeClip?.id).toBe('clip-1');
      expect(initialState.sourceTimeSec).toBeCloseTo(1.0);

      // Sync selectedMediaAsset with active clip as ProjectWorkspace does
      const activeAsset1 = useEditorStore
        .getState()
        .projectMedia.find((m) => m.id === (initialState.activeClip as any)?.mediaAssetId)!;
      store.selectMediaAsset(activeAsset1);
      expect(useEditorStore.getState().selectedMediaAsset?.id).toBe(assetA.id);

      // Advance video to clip-1 end (5.0s source time -> 4000ms timeline boundary)
      const boundaryUpdate = resolveVideoClipTimeUpdate(
        useEditorStore.getState().timeline,
        initialState.activeClip,
        5.0,
        useEditorStore.getState().currentProject?.durationMs,
      );
      expect(boundaryUpdate.didSwitchClip).toBe(true);
      expect(boundaryUpdate.activeClip?.id).toBe('clip-2');
      expect(boundaryUpdate.timelineTimeMs).toBe(4000);
      expect(boundaryUpdate.sourceTimeSec).toBeCloseTo(0.5);
      expect(boundaryUpdate.shouldDriveWithVideo).toBe(true);
      expect(boundaryUpdate.shouldStopPlayback).toBe(false);

      // Apply update to store as EditorViewport and ProjectWorkspace do
      store.setCurrentTimeMs(boundaryUpdate.timelineTimeMs);
      store.setIsVideoDrivenPlayback(boundaryUpdate.shouldDriveWithVideo);
      const activeAsset2 = useEditorStore
        .getState()
        .projectMedia.find((m) => m.id === (boundaryUpdate.activeClip as any)?.mediaAssetId)!;
      store.selectMediaAsset(activeAsset2);

      expect(useEditorStore.getState().currentTimeMs).toBe(4000);
      expect(useEditorStore.getState().isPlaying).toBe(true);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(true);
      expect(useEditorStore.getState().selectedMediaAsset?.id).toBe(assetB.id);

      // Advance clip-2 to its end (5.5s source time -> 9000ms timeline end)
      const endUpdate = resolveVideoClipTimeUpdate(
        useEditorStore.getState().timeline,
        boundaryUpdate.activeClip,
        5.5,
        useEditorStore.getState().currentProject?.durationMs,
      );
      expect(endUpdate.shouldStopPlayback).toBe(true);
      expect(endUpdate.timelineTimeMs).toBe(9000);

      store.setCurrentTimeMs(endUpdate.timelineTimeMs);
      store.setIsPlaying(false);
      store.setIsVideoDrivenPlayback(false);

      expect(useEditorStore.getState().currentTimeMs).toBe(9000);
      expect(useEditorStore.getState().isPlaying).toBe(false);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(false);
    });

    it('hands off playback from video to timeline gap clock across gaps without falling back to selectedClipId or the first clip', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        mediaAssetId: assetA.id,
        startTimeMs: 0,
        endTimeMs: 3000,
        sourceStartMs: 0,
        sourceEndMs: 3000,
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        mediaAssetId: assetB.id,
        startTimeMs: 5000,
        endTimeMs: 8000,
        sourceStartMs: 2000,
        sourceEndMs: 5000,
      });

      const timeline: Timeline = {
        id: 'tl-9h-gap',
        projectId: 'proj-9h-gap',
        totalDurationMs: 8000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'tl-9h-gap',
            name: 'Video 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [clip1, clip2],
          },
        ],
      };

      const store = useEditorStore.getState();
      store.setProject(
        {
          id: 'proj-9h-gap',
          name: 'Gap Handoff Project',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 8000,
        },
        timeline,
      );
      store.setProjectMedia([assetA, assetB]);

      // Select clip-1 for Inspector editing while playing
      store.selectClip('clip-1');
      store.setCurrentTimeMs(0);
      store.setIsPlaying(true);
      store.setIsVideoDrivenPlayback(true);

      // Clip-1 reaches its end at 3.0s source time -> enters gap [3000..5000ms]
      const enterGap = resolveVideoClipTimeUpdate(timeline, clip1, 3.0, 8000);
      expect(enterGap.timelineTimeMs).toBe(3000);
      expect(enterGap.isGap).toBe(true);
      expect(enterGap.activeClip).toBeNull();
      expect(enterGap.shouldDriveWithVideo).toBe(false);
      expect(enterGap.shouldStopPlayback).toBe(false);

      store.setCurrentTimeMs(enterGap.timelineTimeMs);
      store.setIsVideoDrivenPlayback(enterGap.shouldDriveWithVideo);

      // Verify store state in gap: isPlaying stays true, isVideoDrivenPlayback is false, Inspector selection is preserved, and activeClip is strictly null
      expect(useEditorStore.getState().isPlaying).toBe(true);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(false);
      expect(useEditorStore.getState().selectedClipId).toBe('clip-1');

      const gapPlaybackState = resolveTimelinePlaybackState(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        8000,
      );
      expect(gapPlaybackState.activeClip).toBeNull();
      expect(gapPlaybackState.isGap).toBe(true);

      // Step timeline clock across the gap (3000ms -> 4000ms -> 5000ms)
      const midGapStep = resolveTimelineStep(timeline, 3000, 1000, 8000);
      expect(midGapStep.currentTimeMs).toBe(4000);
      expect(midGapStep.isGap).toBe(true);
      expect(midGapStep.activeClip).toBeNull();
      store.setCurrentTimeMs(midGapStep.currentTimeMs);

      const exitGapStep = resolveTimelineStep(timeline, 4000, 1050, 8000);
      // Must snap cleanly onto clip-2 start boundary at 5000ms
      expect(exitGapStep.currentTimeMs).toBe(5000);
      expect(exitGapStep.isGap).toBe(false);
      expect(exitGapStep.activeClip?.id).toBe('clip-2');
      expect(exitGapStep.sourceTimeSec).toBeCloseTo(2.0);
      expect(exitGapStep.shouldDriveWithVideo).toBe(true);

      store.setCurrentTimeMs(exitGapStep.currentTimeMs);
      store.setIsVideoDrivenPlayback(exitGapStep.shouldDriveWithVideo);

      expect(useEditorStore.getState().currentTimeMs).toBe(5000);
      expect(useEditorStore.getState().isPlaying).toBe(true);
      expect(useEditorStore.getState().isVideoDrivenPlayback).toBe(true);
    });

    it('supports seeking across clips, into gaps, and to timeline end while preserving Fase 9A-9G clip properties', () => {
      const clip1 = makeVideoClip({
        id: 'clip-1',
        mediaAssetId: assetA.id,
        startTimeMs: 0,
        endTimeMs: 4000,
        sourceStartMs: 1000,
        sourceEndMs: 5000,
        transform: { x: 15, y: -10, positionX: 15, positionY: -10, scale: 1.25, rotation: 5, opacity: 0.9 },
        crop: { top: 5, right: 10, bottom: 5, left: 10 },
        audioProperties: { volume: 0.8, muted: false, fadeInMs: 300, fadeOutMs: 400 },
      });
      const clip2 = makeVideoClip({
        id: 'clip-2',
        mediaAssetId: assetB.id,
        startTimeMs: 6000,
        endTimeMs: 10000,
        sourceStartMs: 500,
        sourceEndMs: 4500,
      });

      const timeline: Timeline = {
        id: 'tl-9h-seek',
        projectId: 'proj-9h-seek',
        totalDurationMs: 10000,
        updatedAt: new Date().toISOString(),
        tracks: [
          {
            id: 'track-video-1',
            timelineId: 'tl-9h-seek',
            name: 'Video 1',
            trackType: 'video',
            orderIndex: 0,
            isMuted: false,
            isLocked: false,
            volume: 1,
            clips: [clip1, clip2],
          },
        ],
      };

      const store = useEditorStore.getState();
      store.setProject(
        {
          id: 'proj-9h-seek',
          name: 'Seek Multi-Clip Project',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 10000,
        },
        timeline,
      );
      store.selectClip('clip-1');

      // 1. Seek into gap at 5000ms
      store.setCurrentTimeMs(5000);
      const gapSeek = resolveTimelineSeek(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        10000,
      );
      expect(gapSeek.isGap).toBe(true);
      expect(gapSeek.activeClip).toBeNull();
      expect(gapSeek.sourceTimeSec).toBeNull();
      // Inspector selection remains clip-1
      expect(useEditorStore.getState().selectedClipId).toBe('clip-1');

      // 2. Seek into clip-2 at 7500ms -> sourceTimeSec = (7500 - 6000 + 500) / 1000 = 2.0s
      store.setCurrentTimeMs(7500);
      const clip2Seek = resolveTimelineSeek(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        10000,
      );
      expect(clip2Seek.status).toBe('active-clip');
      expect(clip2Seek.activeClip?.id).toBe('clip-2');
      expect(clip2Seek.sourceTimeSec).toBeCloseTo(2.0);

      // 3. Seek to timeline end (10000ms) -> stops playback cleanly, and rewinding to 0ms + togglePlayback restarts from clip-1
      store.setIsPlaying(true);
      store.setCurrentTimeMs(10000);
      const endSeek = resolveTimelineSeek(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        10000,
      );
      expect(endSeek.isTimelineEnded).toBe(true);
      expect(endSeek.activeClip).toBeNull();
      store.setIsPlaying(false);
      store.setIsVideoDrivenPlayback(false);

      // Rewinding playhead to 0ms and toggling playback resumes from clip-1 start (1.0s source time)
      store.setCurrentTimeMs(0);
      store.togglePlayback();
      expect(useEditorStore.getState().currentTimeMs).toBe(0);
      expect(useEditorStore.getState().isPlaying).toBe(true);
      const restartState = resolveTimelinePlaybackState(
        useEditorStore.getState().timeline,
        useEditorStore.getState().currentTimeMs,
        10000,
      );
      expect(restartState.activeClip?.id).toBe('clip-1');
      expect(restartState.sourceTimeSec).toBeCloseTo(1.0);

      // Verify clip-1 transform, crop, audioProperties, and timing were never mutated
      const storedClip1 = useEditorStore.getState().timeline!.tracks[0].clips[0] as VideoClip;
      expect(storedClip1.startTimeMs).toBe(0);
      expect(storedClip1.endTimeMs).toBe(4000);
      expect(storedClip1.sourceStartMs).toBe(1000);
      expect(storedClip1.sourceEndMs).toBe(5000);
      expect(storedClip1.transform).toEqual(clip1.transform);
      expect(storedClip1.crop).toEqual(clip1.crop);
      expect(storedClip1.audioProperties).toEqual(clip1.audioProperties);
    });
  });
});

