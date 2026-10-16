import { describe, it, expect } from 'vitest';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';

describe('Phase 6A: Editor Store & Media Integration', () => {
  it('initializes with default clean editor state', () => {
    const state = useEditorStore.getState();
    expect(state.currentProject).toBeNull();
    expect(state.selectedMediaAsset).toBeNull();
    expect(state.projectMedia).toEqual([]);
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
  });

  it('updates project and resets transient playback/selection', () => {
    const mockProject = {
      id: 'proj-123',
      name: 'Sample Commercial',
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
    };

    useEditorStore.getState().setProject(mockProject);
    const updated = useEditorStore.getState();

    expect(updated.currentProject).toEqual(mockProject);
    expect(updated.currentTimeMs).toBe(0);
    expect(updated.isPlaying).toBe(false);
    expect(updated.selectedMediaAsset).toBeNull();
  });

  it('manages project media selection and dirty state correctly', () => {
    const mockMediaAsset = {
      id: 'asset-abc',
      storageKey: 'raw/user-123/asset-abc.mp4',
      originalFilename: 'b_roll_ocean.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 10485760,
      ingestionStatus: 'ready',
      hasAudio: true,
      createdAt: new Date().toISOString(),
    };

    useEditorStore.getState().setProjectMedia([mockMediaAsset]);
    expect(useEditorStore.getState().projectMedia.length).toBe(1);

    useEditorStore.getState().selectMediaAsset(mockMediaAsset);
    expect(useEditorStore.getState().selectedMediaAsset?.id).toBe('asset-abc');

    // Test caching preview URL
    useEditorStore.getState().updateMediaAssetPreviewUrl('asset-abc', 'https://signed.r2.com/video.mp4');
    expect(useEditorStore.getState().selectedMediaAsset?.previewUrl).toBe('https://signed.r2.com/video.mp4');

    // Test dirty tracking
    useEditorStore.getState().markDirty(true);
    expect(useEditorStore.getState().isDirty).toBe(true);

    useEditorStore.getState().recordSaved();
    expect(useEditorStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState().isSaving).toBe(false);
    expect(useEditorStore.getState().lastSavedAt).not.toBeNull();
  });
});
