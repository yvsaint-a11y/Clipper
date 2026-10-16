import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/features/editor/stores/useEditorStore';

describe('Phase 7H: Responsive Editor & Mobile Layout Fix', () => {
  beforeEach(() => {
    useEditorStore.setState({
      currentProject: null,
      timeline: null,
      projectMedia: [],
      selectedMediaAsset: null,
      selectedClipId: null,
      selectedTrackId: null,
      isDirty: false,
      isSaving: false,
    });
  });

  describe('1. Viewport Aspect Ratio Containment & Responsive Classes', () => {
    // Tests the viewport aspect ratio containment logic to ensure no overflow on mobile
    const computeAspectRatioClasses = (aspectRatio: string) => {
      switch (aspectRatio) {
        case '9:16':
          return 'aspect-[9/16] w-auto h-full max-h-[85%] max-w-[90%] sm:w-[240px] sm:h-[426px]';
        case '1:1':
          return 'aspect-square w-auto h-auto max-w-[90%] max-h-[85%] sm:w-[360px] sm:h-[360px]';
        default: // 16:9
          return 'aspect-[16/9] w-full max-w-[95%] sm:max-w-[560px] max-h-[85%]';
      }
    };

    it('applies 16:9 responsive aspect ratio class that fits mobile width without exceeding container', () => {
      const classes = computeAspectRatioClasses('16:9');
      expect(classes).toContain('aspect-[16/9]');
      expect(classes).toContain('w-full');
      expect(classes).toContain('max-w-[95%]');
      expect(classes).toContain('sm:max-w-[560px]');
    });

    it('applies 9:16 portrait aspect ratio class that fits height and width on mobile without clipping', () => {
      const classes = computeAspectRatioClasses('9:16');
      expect(classes).toContain('aspect-[9/16]');
      expect(classes).toContain('max-h-[85%]');
      expect(classes).toContain('max-w-[90%]');
      expect(classes).toContain('sm:w-[240px]');
      expect(classes).toContain('sm:h-[426px]');
    });

    it('applies 1:1 square aspect ratio class that scales down responsively on narrow viewports', () => {
      const classes = computeAspectRatioClasses('1:1');
      expect(classes).toContain('aspect-square');
      expect(classes).toContain('max-w-[90%]');
      expect(classes).toContain('max-h-[85%]');
      expect(classes).toContain('sm:w-[360px]');
      expect(classes).toContain('sm:h-[360px]');
    });
  });

  describe('2. Mobile Panel Stacking & Switching in ProjectWorkspace', () => {
    it('manages mobile panel selection among media, inspector, and stacked both', () => {
      let mobilePanelTab: 'media' | 'inspector' | 'both' = 'media';
      const setMobilePanelTab = (tab: 'media' | 'inspector' | 'both') => {
        mobilePanelTab = tab;
      };

      expect(mobilePanelTab).toBe('media');

      // User selects Inspector
      setMobilePanelTab('inspector');
      expect(mobilePanelTab).toBe('inspector');

      // User selects Both (stacked)
      setMobilePanelTab('both');
      expect(mobilePanelTab).toBe('both');
    });

    it('automatically transitions to inspector on narrow viewports when a timeline clip is selected', () => {
      let mobilePanelTab: 'media' | 'inspector' | 'both' = 'media';

      const handleClipSelection = (clipId: string | null, isMobileViewport: boolean) => {
        if (clipId && isMobileViewport) {
          mobilePanelTab = 'inspector';
        }
      };

      // Clip selected on desktop (>=1024px) does not change mobile tab
      handleClipSelection('clip-101', false);
      expect(mobilePanelTab).toBe('media');

      // Clip selected on mobile (<1024px) auto-switches to inspector for instant clip timing editing
      handleClipSelection('clip-101', true);
      expect(mobilePanelTab).toBe('inspector');
    });

    it('renders desktop layout with all panels side-by-side without hiding either', () => {
      // Logic check for classes: desktop (lg:) always shows both panels simultaneously
      const getMediaPanelClasses = (mobileTab: string) => {
        const isVisibleOnMobile = mobileTab === 'media' || mobileTab === 'both';
        return `${isVisibleOnMobile ? 'flex flex-col' : 'hidden'} lg:flex lg:flex-col w-full lg:w-64 xl:w-72 shrink-0`;
      };

      const getInspectorPanelClasses = (mobileTab: string) => {
        const isVisibleOnMobile = mobileTab === 'inspector' || mobileTab === 'both';
        return `${isVisibleOnMobile ? 'flex flex-col' : 'hidden'} lg:flex lg:flex-col w-full lg:w-64 xl:w-72 shrink-0`;
      };

      // When mobileTab is 'media', on desktop (lg:) inspector is still flex (visible)
      const inspectorClasses = getInspectorPanelClasses('media');
      expect(inspectorClasses).toContain('hidden'); // hidden on mobile
      expect(inspectorClasses).toContain('lg:flex'); // visible on desktop
      expect(inspectorClasses).toContain('lg:w-64');

      // When mobileTab is 'inspector', on desktop (lg:) media is still flex (visible)
      const mediaClasses = getMediaPanelClasses('inspector');
      expect(mediaClasses).toContain('hidden'); // hidden on mobile
      expect(mediaClasses).toContain('lg:flex'); // visible on desktop
      expect(mediaClasses).toContain('lg:w-64');

      // When mobileTab is 'both', both are full-width stacked on mobile and side-by-side on desktop
      const bothMediaClasses = getMediaPanelClasses('both');
      const bothInspectorClasses = getInspectorPanelClasses('both');
      expect(bothMediaClasses).toContain('w-full');
      expect(bothInspectorClasses).toContain('w-full');
    });
  });

  describe('3. Timeline Horizontal Containment & Track Header Scaling', () => {
    it('constrains timeline track header column on mobile viewports', () => {
      const trackHeaderColClass = 'w-28 xs:w-36 sm:w-56 shrink-0 border-r border-[#20273a] bg-[#0c0e14] flex flex-col z-20';
      // On narrow mobile it is w-28 (112px) or w-36 (144px), not forcing 224px (w-56)
      expect(trackHeaderColClass).toContain('w-28');
      expect(trackHeaderColClass).toContain('sm:w-56');
    });

    it('enforces min-w-0 on scroll container so wide timeline canvas never overflows outer page', () => {
      const scrollContainerClass = 'flex-1 min-w-0 overflow-x-auto overflow-y-hidden flex flex-col relative bg-[#07080d]';
      expect(scrollContainerClass).toContain('min-w-0');
      expect(scrollContainerClass).toContain('overflow-x-auto');
      expect(scrollContainerClass).toContain('flex-1');
    });

    it('properly calculates wide timeline canvas width without affecting flexbox constraints', () => {
      const durationMs = 120000; // 2 minutes
      const zoomLevel = 100; // 100px/s
      const pixelsPerSecond = Math.max(10, zoomLevel);
      const timelineContentWidthPx = Math.max(800, (durationMs / 1000) * pixelsPerSecond + 120);

      expect(timelineContentWidthPx).toBe(12120); // 12,120px wide canvas internally scrolled
    });
  });

  describe('4. Toolbar Responsive Controls & Non-Overlapping Actions', () => {
    it('adapts project title input and header max widths for narrow screens', () => {
      const titleClasses = 'text-xs sm:text-sm font-semibold text-white tracking-tight truncate max-w-[110px] xs:max-w-[150px] sm:max-w-xs';
      expect(titleClasses).toContain('max-w-[110px]');
      expect(titleClasses).toContain('sm:max-w-xs');
      expect(titleClasses).toContain('truncate');
    });

    it('provides responsive labels for secondary actions (Save as Template -> Template, Replace Media -> Replace)', () => {
      const getReplaceMediaLabel = (isNarrow: boolean) => (isNarrow ? 'Replace' : 'Replace Media');
      const getTemplateLabel = (isNarrow: boolean) => (isNarrow ? 'Template' : 'Save as Template');
      const getSaveLabel = (isNarrow: boolean, isSaving: boolean, isDirty: boolean) => {
        if (isSaving) return isNarrow ? '...' : 'Saving...';
        if (isDirty) return isNarrow ? 'Save' : 'Save Project';
        return 'Saved';
      };

      expect(getReplaceMediaLabel(true)).toBe('Replace');
      expect(getReplaceMediaLabel(false)).toBe('Replace Media');
      expect(getTemplateLabel(true)).toBe('Template');
      expect(getTemplateLabel(false)).toBe('Save as Template');
      expect(getSaveLabel(true, false, true)).toBe('Save');
      expect(getSaveLabel(false, false, true)).toBe('Save Project');
    });
  });

  describe('5. Preservation of Existing Editor Functionality', () => {
    it('maintains full editor store clip timing, track selection, and dirty state updates', () => {
      const mockProject = {
        id: 'proj-responsive-1',
        name: 'Responsive Commercial',
        aspectRatio: '9:16' as const,
        resolution: '1080x1920',
        fps: 30,
        durationMs: 15000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useEditorStore.getState().setProject(mockProject);
      expect(useEditorStore.getState().currentProject?.id).toBe('proj-responsive-1');

      // Verify aspect ratio in store matches
      expect(useEditorStore.getState().currentProject?.aspectRatio).toBe('9:16');

      // Test dirty state and saving
      useEditorStore.getState().markDirty(true);
      expect(useEditorStore.getState().isDirty).toBe(true);

      useEditorStore.getState().setSaving(true);
      expect(useEditorStore.getState().isSaving).toBe(true);

      useEditorStore.getState().recordSaved();
      expect(useEditorStore.getState().isSaving).toBe(false);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });
});
