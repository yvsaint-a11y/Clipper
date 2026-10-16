export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface ProjectSettings {
  aspectRatio: AspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  fps: 30 | 60;
  durationMs: number;
  backgroundColor: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  aspectRatio: AspectRatio;
  settings: ProjectSettings;
  thumbnailUrl?: string | null;
  templateVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  timelineSnapshot: Record<string, unknown>;
  changeSummary?: string | null;
  createdAt: string;
}
