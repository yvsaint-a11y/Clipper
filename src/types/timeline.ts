export interface Transform2D {
  x: number;          // Horizontal offset in canvas pixels
  y: number;          // Vertical offset in canvas pixels
  positionX?: number; // Canonical alias for horizontal offset in canvas pixels
  positionY?: number; // Canonical alias for vertical offset in canvas pixels
  scale: number;      // 1.0 = 100% (minimum 0.01)
  rotation: number;   // Degrees
  opacity: number;    // 0.0 to 1.0
}

export interface CropBox {
  top: number;        // Normalized top edge crop (0.0 to 1.0, 0 = no crop)
  right: number;      // Normalized right edge crop (0.0 to 1.0, 0 = no crop)
  bottom: number;     // Normalized bottom edge crop (0.0 to 1.0, 0 = no crop)
  left: number;       // Normalized left edge crop (0.0 to 1.0, 0 = no crop)
  x?: number;         // Optional legacy normalized left
  y?: number;         // Optional legacy normalized top
  width?: number;     // Optional legacy normalized width
  height?: number;    // Optional legacy normalized height
}

export interface AudioProperties {
  volume: number;     // 0.0 to 2.0 (1.0 = unity gain)
  fadeInMs: number;
  fadeOutMs: number;
  muted: boolean;
  pan?: number;       // -1.0 (L) to 1.0 (R)
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  backgroundColor?: string;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}

export interface CaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface CaptionSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words?: CaptionWord[];
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  activeWordColor: string;
  backgroundColor?: string;
  maxWordsPerLine: number;
  animationPreset: 'pop' | 'fade' | 'slide' | 'none';
  textTransform: 'uppercase' | 'capitalize' | 'none';
}

export type BasicTransitionType = 'cut' | 'crossfade';

export interface ClipTransition {
  id: string;
  type: BasicTransitionType;
  durationMs: number;
  fromClipId: string;
  toClipId: string;
  trackId: string;
}

export interface TransitionConfig {
  id?: string;
  type: 'cut' | 'fade' | 'crossfade' | 'wipe-left' | 'wipe-right' | 'zoom' | 'slide-up' | 'slide-down';
  durationMs: number;
  fromClipId?: string;
  toClipId?: string;
  trackId?: string;
}

export interface AnimationConfig {
  type: 'bounce' | 'fade-in' | 'slide-in' | 'scale-up' | 'pulse';
  durationMs: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type TrackType = 'video' | 'audio' | 'text' | 'caption' | 'overlay';
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'caption';

export interface BaseClip {
  id: string;
  trackId: string;
  name: string;
  clipType: ClipType;
  startTimeMs: number;  // Placement position on the project timeline
  endTimeMs: number;    // Placement end on timeline (duration = endTimeMs - startTimeMs)
  slotBinding?: string | null;
}

export interface VideoClip extends BaseClip {
  clipType: 'video';
  mediaAssetId: string;
  sourceStartMs: number; // In-point of source footage
  sourceEndMs: number;   // Out-point of source footage
  transform: Transform2D;
  crop?: CropBox | null;
  audioProperties: AudioProperties;
  transitionIn?: TransitionConfig | null;
  transitionOut?: TransitionConfig | null;
  animation?: AnimationConfig | null;
}

export interface AudioClip extends BaseClip {
  clipType: 'audio';
  mediaAssetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  audioProperties: AudioProperties;
}

export interface ImageClip extends BaseClip {
  clipType: 'image';
  mediaAssetId: string;
  transform: Transform2D;
  crop?: CropBox | null;
  transitionIn?: TransitionConfig | null;
  transitionOut?: TransitionConfig | null;
  animation?: AnimationConfig | null;
}

export interface TextClip extends BaseClip {
  clipType: 'text';
  textContent: string;
  style: TextStyle;
  transform: Transform2D;
  animation?: AnimationConfig | null;
}

export interface CaptionClip extends BaseClip {
  clipType: 'caption';
  segments: CaptionSegment[];
  style: CaptionStyle;
  transform: Transform2D;
}

export type TimelineClip = VideoClip | AudioClip | ImageClip | TextClip | CaptionClip;

export interface TimelineTrack {
  id: string;
  timelineId: string;
  name: string;
  trackType: TrackType;
  orderIndex: number;
  isMuted: boolean;
  isLocked: boolean;
  volume: number; // 0.0 to 1.0
  clips: TimelineClip[];
  transitions?: ClipTransition[];
}

export interface Timeline {
  id: string;
  projectId: string;
  totalDurationMs: number;
  tracks: TimelineTrack[];
  transitions?: ClipTransition[];
  updatedAt: string;
}
