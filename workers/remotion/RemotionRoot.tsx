import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { ClipperComposition, type ClipperCompositionProps } from './ClipperComposition';
import { getCompositionDimensions, msToFrames } from './types';
import type { CanonicalRenderSpec } from '@/src/types/render';

export const COMPOSITION_ID = 'ClipperVideo';

const defaultRenderSpec: CanonicalRenderSpec = {
  projectId: 'sample-project',
  timelineHash: 'default-timeline-hash',
  renderSettings: {
    resolution: '1080p',
    fps: 30,
    watermark: false,
  },
  aspectRatio: '16:9',
  durationMs: 5000,
  tracks: [
    {
      id: 'track-v1',
      name: 'Video 1',
      trackType: 'video',
      orderIndex: 0,
      isMuted: false,
      volume: 1,
      clips: [],
    },
  ],
};

export const calculateClipperMetadata: CalculateMetadataFunction<ClipperCompositionProps> = ({
  props,
}) => {
  const spec = props.spec || defaultRenderSpec;
  const targetFps = spec.renderSettings?.fps || 30;
  const targetDimensions = getCompositionDimensions(
    spec.aspectRatio || '16:9',
    spec.renderSettings?.resolution || '1080p',
  );
  const totalFrames = Math.max(1, msToFrames(spec.durationMs || 5000, targetFps));

  return {
    fps: targetFps,
    durationInFrames: totalFrames,
    width: targetDimensions.width,
    height: targetDimensions.height,
  };
};

export const RemotionRoot: React.FC = () => {
  const dimensions = getCompositionDimensions(
    defaultRenderSpec.aspectRatio || '16:9',
    defaultRenderSpec.renderSettings.resolution || '1080p',
  );
  const fps = defaultRenderSpec.renderSettings.fps || 30;
  const durationInFrames = Math.max(1, msToFrames(defaultRenderSpec.durationMs || 5000, fps));

  return (
    <>
      <Composition
        id={COMPOSITION_ID}
        component={ClipperComposition}
        durationInFrames={durationInFrames}
        fps={fps}
        width={dimensions.width}
        height={dimensions.height}
        defaultProps={{
          spec: defaultRenderSpec,
          mediaAssetUrls: {},
        }}
        calculateMetadata={calculateClipperMetadata}
      />
    </>
  );
};

import { registerRoot } from 'remotion';
registerRoot(RemotionRoot);
