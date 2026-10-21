import path from 'node:path';
import fs from 'node:fs';
import type { CanonicalRenderSpec } from '@/src/types/render';
import { validateCanonicalRenderSpec } from '@/src/features/editor/utils/renderSpec';
import { COMPOSITION_ID } from './RemotionRoot';
import { getCompositionDimensions, msToFrames, checkRenderSpecFeatureSupport } from './types';

export class RenderEnvironmentError extends Error {
  isEnvironment = true;
  constructor(message: string) {
    super(message);
    this.name = 'RenderEnvironmentError';
  }
}

export interface RenderPipelineOptions {
  spec: CanonicalRenderSpec;
  outputFilePath: string;
  mediaAssetUrls?: Record<string, string>;
  onProgress?: (progressPercentage: number) => void;
}

export interface RenderPipelineResult {
  outputFilePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
}

/**
 * Checks whether the local server environment has the required Chromium
 * and FFmpeg binaries to execute headless frame rendering.
 */
export async function isRenderEnvironmentAvailable(): Promise<{ available: boolean; reason?: string }> {
  try {
    const { execSync } = await import('node:child_process');

    // 1. Check FFmpeg
    try {
      execSync('which ffmpeg', { stdio: 'ignore' });
    } catch {
      return { available: false, reason: 'FFmpeg binary not found on system PATH.' };
    }

    // 2. Check Chromium via Remotion ensureBrowser or system PATH
    try {
      const { ensureBrowser } = await import('@remotion/renderer');
      await ensureBrowser();
    } catch {
      try {
        execSync('which chromium || which chromium-browser || which google-chrome', {
          stdio: 'ignore',
          shell: '/bin/bash',
        });
      } catch {
        return {
          available: false,
          reason:
            'Headless Chromium browser is not installed in this environment. Rendering requires Chromium for frame rasterization.',
        };
      }
    }

    return { available: true };
  } catch (err: unknown) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : 'Unknown environment check error',
    };
  }
}

/**
 * Invokes the Remotion rendering pipeline to render a CanonicalRenderSpec directly to an MP4 file.
 */
export async function renderSpecToMp4(options: RenderPipelineOptions): Promise<RenderPipelineResult> {
  const { spec, outputFilePath, mediaAssetUrls = {}, onProgress } = options;

  // 1. Validate spec structure
  const specValidation = validateCanonicalRenderSpec(spec);
  if (!specValidation.valid) {
    throw new Error(`Cannot render invalid specification: ${specValidation.errors.join(', ')}`);
  }

  // 2. Check feature support
  const supportReport = checkRenderSpecFeatureSupport(spec);
  if (!supportReport.isFullySupported) {
    throw new Error(
      `Unsupported features in render specification: ${supportReport.unsupportedFeatures.join(', ')}`,
    );
  }

  // 3. Verify environment prerequisites (Chromium & FFmpeg)
  const envCheck = await isRenderEnvironmentAvailable();
  if (!envCheck.available) {
    throw new RenderEnvironmentError(envCheck.reason || 'Rendering environment prerequisites not met.');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputFilePath);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const targetFps = spec.renderSettings?.fps || 30;
  const dimensions = getCompositionDimensions(
    spec.aspectRatio || '16:9',
    spec.renderSettings?.resolution || '1080p',
  );
  const totalFrames = Math.max(1, msToFrames(spec.durationMs || 5000, targetFps));

  // 4. Dynamically import Remotion bundler and renderer
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const { fileURLToPath } = await import('node:url');
  const currentDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  const rootEntry = path.resolve(currentDir, 'RemotionRoot.tsx');

  const bundleLocation = await bundle({
    entryPoint: rootEntry,
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: COMPOSITION_ID,
    inputProps: {
      spec,
      mediaAssetUrls,
    },
  });

  // 5. Execute frame rendering to MP4
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputFilePath,
    inputProps: {
      spec,
      mediaAssetUrls,
    },
    onProgress: ({ renderedFrames, encodedFrames }) => {
      const progress = Math.min(99, Math.round((encodedFrames / totalFrames) * 100));
      if (onProgress) {
        onProgress(progress);
      }
    },
  });

  const stats = await fs.promises.stat(outputFilePath);
  const durationSeconds = Math.round(totalFrames / targetFps);

  return {
    outputFilePath,
    fileSizeBytes: stats.size,
    durationSeconds,
    width: dimensions.width,
    height: dimensions.height,
    fps: targetFps,
  };
}
