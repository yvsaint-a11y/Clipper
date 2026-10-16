import type { AspectRatio } from './project';

export type TemplateSlotType = 'video' | 'image' | 'audio' | 'text' | 'caption' | 'logo' | 'color';
export type TemplateCategory = 'podcast' | 'gaming' | 'vlog' | 'marketing' | 'social' | 'tutorial' | 'corporate' | 'general' | string;

export interface TemplateSlotConstraints {
  isRequired?: boolean;
  maxDurationMs?: number;
  minDurationMs?: number;
  maxCharacters?: number;
  allowedMimeTypes?: string[];
  allowedAspectRatios?: string[];
  minResolution?: { width: number; height: number };
  [key: string]: unknown;
}

export interface ProjectToTemplateSlotConfig {
  targetClipId: string;
  isSlot: boolean;
  slotKey?: string;
  label?: string;
  type?: TemplateSlotType;
  description?: string;
  isRequired?: boolean;
  displayOrder?: number;
}

export interface CreateTemplateFromProjectInput {
  templateName?: string;
  description?: string;
  category?: TemplateCategory;
  isPublic?: boolean;
  slotConfigurations?: ProjectToTemplateSlotConfig[];
}

export interface TemplateSlot {
  id: string;
  templateVersionId: string;
  slotKey: string; // E.g. "bg_video", "hero_video", "headline_text", "logo"
  label: string;
  type: TemplateSlotType;
  description?: string | null;
  targetClipId: string;
  defaultValue?: any;
  constraints: TemplateSlotConstraints;
  displayOrder: number;
  createdAt: string;
}

export interface CanonicalTemplateClip {
  id: string;
  name: string;
  clipType: string;
  startTimeMs: number;
  endTimeMs: number;
  sourceStartMs?: number;
  sourceEndMs?: number;
  slotBinding?: string | null;
  mediaAssetId?: string | null;
  transform?: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    opacity: number;
  };
  crop?: any;
  audioProperties?: any;
  textProperties?: any;
  captionProperties?: any;
  transitions?: any;
  effects?: any[];
  animations?: any[];
}

export interface CanonicalTemplateTrack {
  id: string;
  name: string;
  trackType: string;
  orderIndex: number;
  isMuted: boolean;
  isLocked: boolean;
  volume: number;
  clips: CanonicalTemplateClip[];
}

export interface CanonicalTemplateSlotDefinition {
  slotKey: string;
  label: string;
  type: TemplateSlotType;
  description?: string | null;
  targetClipId: string;
  defaultValue?: any;
  constraints: TemplateSlotConstraints;
  displayOrder: number;
}

export interface CanonicalTemplateSnapshot {
  templateId?: string;
  name: string;
  category: string;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  durationMs: number;
  tracks: CanonicalTemplateTrack[];
  slots: CanonicalTemplateSlotDefinition[];
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  timelineSnapshot: CanonicalTemplateSnapshot;
  changelog?: string | null;
  checksum: string;
  isPublished: boolean;
  slots?: TemplateSlot[];
  createdAt: string;
}

export interface Template {
  id: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  category: TemplateCategory;
  aspectRatio: AspectRatio;
  isPublic: boolean;
  isSystem: boolean;
  isArchived: boolean;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  currentVersionNumber: number;
  latestVersionNumber?: number;
  slotCount?: number;
  durationMs?: number;
  resolution?: string;
  fps?: number;
  latestVersion?: TemplateVersion | null;
  versions?: TemplateVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplyTemplateInput {
  projectName?: string;
  versionNumber?: number;
  versionId?: string;
}

export interface ApplyTemplateResponse {
  project: {
    id: string;
    userId: string;
    name: string;
    description?: string | null;
    aspectRatio: AspectRatio;
    resolution: string;
    fps: number;
    durationMs: number;
    currentVersionNumber: number;
    thumbnailUrl?: string | null;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
  };
  timeline: {
    id: string;
    projectId: string;
    totalDurationMs: number;
    fps: number;
    tracks: any[];
  };
  templateVersionApplied: number;
}
