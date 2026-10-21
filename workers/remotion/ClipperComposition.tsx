import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig, OffthreadVideo, Img, Audio } from 'remotion';
import type { CanonicalRenderSpec } from '@/src/types/render';
import { msToFrames, calculateFrameAudioVolume } from './types';

export type ClipperCompositionProps = {
  spec: CanonicalRenderSpec;
  mediaAssetUrls?: Record<string, string>;
  [key: string]: unknown;
};

export const ClipperComposition: React.FC<ClipperCompositionProps> = ({
  spec,
  mediaAssetUrls = {},
}) => {
  const { fps } = useVideoConfig();

  const tracks = spec.tracks || [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', overflow: 'hidden' }}>
      {/* Render Video Tracks */}
      {tracks
        .filter((track) => track.trackType === 'video')
        .map((track) => (
          <React.Fragment key={track.id || track.name}>
            {(track.clips || []).map((clip: any) => {
              const fromFrame = msToFrames(clip.startTimeMs, fps);
              const durationFrames = Math.max(1, msToFrames(clip.endTimeMs - clip.startTimeMs, fps));

              const resolvedSrc = clip.mediaAssetId ? mediaAssetUrls[clip.mediaAssetId] : null;

              const sourceStartFrame = msToFrames(clip.sourceStartMs || 0, fps);
              const sourceEndFrame = msToFrames(
                clip.sourceEndMs || (clip.endTimeMs - clip.startTimeMs),
                fps,
              );

              const transform = clip.transform || {};
              const posX = transform.positionX ?? 0;
              const posY = transform.positionY ?? 0;
              const scale = transform.scale ?? 1;
              const rotation = transform.rotation ?? 0;
              const opacity = transform.opacity ?? 1;

              const audioProps = clip.audioProperties || {};
              const isMuted = Boolean(audioProps.muted || track.isMuted);
              const clipVolume = audioProps.volume !== undefined ? Number(audioProps.volume) : 1;
              const trackVolume = track.volume !== undefined ? Number(track.volume) : 1;
              const effectiveVolume = isMuted ? 0 : Math.max(0, Math.min(1, clipVolume * trackVolume));

              const fadeInFrames = msToFrames(audioProps.fadeInMs ?? 0, fps);
              const fadeOutFrames = msToFrames(audioProps.fadeOutMs ?? 0, fps);

              const crop = clip.crop;
              const clipPath =
                crop && (crop.top || crop.right || crop.bottom || crop.left)
                  ? `inset(${crop.top || 0}% ${crop.right || 0}% ${crop.bottom || 0}% ${crop.left || 0}%)`
                  : undefined;

              const isImage = clip.clipType === 'image';

              return (
                <Sequence
                  key={clip.id || `${clip.startTimeMs}-${clip.endTimeMs}`}
                  from={fromFrame}
                  durationInFrames={durationFrames}
                  layout="none"
                >
                  <AbsoluteFill
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity,
                      transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                      clipPath,
                    }}
                  >
                    {resolvedSrc ? (
                      isImage ? (
                        <Img
                          src={resolvedSrc}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <OffthreadVideo
                          src={resolvedSrc}
                          startFrom={sourceStartFrame}
                          endAt={sourceEndFrame}
                          volume={(f) =>
                            calculateFrameAudioVolume(
                              f,
                              durationFrames,
                              effectiveVolume,
                              isMuted,
                              fadeInFrames,
                              fadeOutFrames,
                            )
                          }
                          muted={isMuted}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      )
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#1B1C1E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#94A3B8',
                          fontSize: 24,
                          fontFamily: 'sans-serif',
                        }}
                      >
                        {clip.name || 'Video Clip'}
                      </div>
                    )}
                  </AbsoluteFill>
                </Sequence>
              );
            })}
          </React.Fragment>
        ))}

      {/* Render Dedicated Audio Tracks */}
      {tracks
        .filter((track) => track.trackType === 'audio')
        .map((track) => (
          <React.Fragment key={track.id || track.name}>
            {(track.clips || []).map((clip: any) => {
              const fromFrame = msToFrames(clip.startTimeMs, fps);
              const durationFrames = Math.max(1, msToFrames(clip.endTimeMs - clip.startTimeMs, fps));

              const resolvedSrc = clip.mediaAssetId ? mediaAssetUrls[clip.mediaAssetId] : null;

              const sourceStartFrame = msToFrames(clip.sourceStartMs || 0, fps);
              const sourceEndFrame = msToFrames(
                clip.sourceEndMs || (clip.endTimeMs - clip.startTimeMs),
                fps,
              );

              const audioProps = clip.audioProperties || {};
              const isMuted = Boolean(audioProps.muted || track.isMuted);
              const clipVolume = audioProps.volume !== undefined ? Number(audioProps.volume) : 1;
              const trackVolume = track.volume !== undefined ? Number(track.volume) : 1;
              const effectiveVolume = isMuted ? 0 : Math.max(0, Math.min(1, clipVolume * trackVolume));

              const fadeInFrames = msToFrames(audioProps.fadeInMs ?? 0, fps);
              const fadeOutFrames = msToFrames(audioProps.fadeOutMs ?? 0, fps);

              if (!resolvedSrc) {
                return null;
              }

              return (
                <Sequence
                  key={clip.id || `audio-${clip.startTimeMs}-${clip.endTimeMs}`}
                  from={fromFrame}
                  durationInFrames={durationFrames}
                  layout="none"
                >
                  <Audio
                    src={resolvedSrc}
                    startFrom={sourceStartFrame}
                    endAt={sourceEndFrame}
                    muted={isMuted}
                    volume={(f) =>
                      calculateFrameAudioVolume(
                        f,
                        durationFrames,
                        effectiveVolume,
                        isMuted,
                        fadeInFrames,
                        fadeOutFrames,
                      )
                    }
                  />
                </Sequence>
              );
            })}
          </React.Fragment>
        ))}

      {/* Render Text Overlay Tracks */}
      {tracks
        .filter((track) => track.trackType === 'text')
        .map((track) => (
          <React.Fragment key={track.id || track.name}>
            {(track.clips || []).map((clip: any) => {
              const fromFrame = msToFrames(clip.startTimeMs, fps);
              const durationFrames = Math.max(1, msToFrames(clip.endTimeMs - clip.startTimeMs, fps));
              const textProps = clip.textProperties || {};

              const fontSize = textProps.fontSize ?? 48;
              const fontFamily = textProps.fontFamily || 'Inter, sans-serif';
              const fontWeight = textProps.fontWeight || 'bold';
              const color = textProps.color || '#FFFFFF';
              const backgroundColor = textProps.backgroundColor || 'transparent';
              const posX = textProps.positionX ?? 0;
              const posY = textProps.positionY ?? 0;

              return (
                <Sequence
                  key={clip.id || `text-${clip.startTimeMs}`}
                  from={fromFrame}
                  durationInFrames={durationFrames}
                  layout="none"
                >
                  <AbsoluteFill
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        transform: `translate(${posX}px, ${posY}px)`,
                        fontSize: `${fontSize}px`,
                        fontFamily,
                        fontWeight,
                        color,
                        backgroundColor,
                        padding: backgroundColor !== 'transparent' ? '8px 16px' : undefined,
                        borderRadius: 8,
                        textAlign: 'center',
                        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
                        maxWidth: '85%',
                        lineHeight: 1.25,
                      }}
                    >
                      {textProps.text || clip.name || ''}
                    </div>
                  </AbsoluteFill>
                </Sequence>
              );
            })}
          </React.Fragment>
        ))}

      {/* Optional Watermark */}
      {spec.renderSettings?.watermark && (
        <AbsoluteFill
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 32,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '6px 14px',
              backgroundColor: 'rgba(0,0,0,0.65)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '1px',
            }}
          >
            CLIPPER
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
