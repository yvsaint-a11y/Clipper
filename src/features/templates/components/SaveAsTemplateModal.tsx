import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, FeedbackBanner } from '@/src/components/ui';
import { motionTokens } from '@/src/lib/designTokens';
import {
  LayoutTemplate,
  X,
  CheckCircle2,
  Video,
  Music,
  Image as ImageIcon,
  Type,
  Lock,
  Layers,
  Sparkles,
  HelpCircle,
  Sliders,
  Clock,
  ArrowRight,
} from 'lucide-react';
import type { AspectRatio } from '@/src/types/project';
import type {
  TemplateSlotType,
  TemplateCategory,
  ProjectToTemplateSlotConfig,
  Template,
} from '@/src/types/template';

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  durationMs: number;
}

export interface EditableSlotConfig {
  clipId: string;
  clipName: string;
  clipType: string;
  trackName: string;
  trackType: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  isSlot: boolean;
  label: string;
  type: TemplateSlotType;
  isRequired: boolean;
  description: string;
  displayOrder: number;
}

export interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectSummary;
  timeline: {
    tracks: Array<{
      id: string;
      name: string;
      trackType?: string;
      clips?: Array<{
        id: string;
        name: string;
        clipType?: string;
        startTimeMs: number;
        endTimeMs: number;
        [key: string]: any;
      }>;
    }>;
    totalDurationMs?: number;
  } | null;
  accessToken: string | null;
  onSuccess?: (createdTemplate: Template) => void;
}

const CATEGORIES: Array<{ value: TemplateCategory; label: string }> = [
  { value: 'social', label: 'Social Media / Shorts / TikTok' },
  { value: 'marketing', label: 'Marketing & Promo Ads' },
  { value: 'podcast', label: 'Podcast & Interview Clips' },
  { value: 'vlog', label: 'Vlog & Lifestyle' },
  { value: 'gaming', label: 'Gaming Highlights' },
  { value: 'tutorial', label: 'Tutorial & Educational' },
  { value: 'corporate', label: 'Corporate & Presentation' },
  { value: 'general', label: 'General / Other' },
];

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  isOpen,
  onClose,
  project,
  timeline,
  accessToken,
  onSuccess,
}) => {
  // Form State
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('general');
  const [isPublic, setIsPublic] = useState(false);
  const [slotConfigs, setSlotConfigs] = useState<EditableSlotConfig[]>([]);

  // Workflow State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTemplateResult, setCreatedTemplateResult] = useState<any | null>(null);

  // Initialize or reset form state whenever modal is opened
  useEffect(() => {
    if (!isOpen) return;

    // Reset feedback
    setError(null);
    setCreatedTemplateResult(null);

    // Metadata defaults
    setTemplateName(`${project.name} (Template)`);
    setDescription(project.description || '');
    setCategory('general');
    setIsPublic(false);

    // Extract all eligible clips across tracks into slot configurations
    const extractedConfigs: EditableSlotConfig[] = [];
    let slotIdx = 1;

    if (timeline?.tracks) {
      for (const track of timeline.tracks) {
        if (!track.clips) continue;
        for (const clip of track.clips) {
          const clipDuration = clip.endTimeMs - clip.startTimeMs;
          let initialType: TemplateSlotType = 'video';
          let defaultLabel = clip.name;

          if (clip.clipType === 'audio' || track.trackType === 'audio') {
            initialType = 'audio';
            defaultLabel = defaultLabel || `Audio Track ${slotIdx}`;
          } else if (clip.clipType === 'image') {
            initialType = 'image';
            defaultLabel = defaultLabel || `Image Slot ${slotIdx}`;
          } else if (clip.clipType === 'text') {
            initialType = 'text';
            defaultLabel = defaultLabel || `Headline ${slotIdx}`;
          } else {
            initialType = 'video';
            defaultLabel = defaultLabel || `Main Footage ${slotIdx}`;
          }

          extractedConfigs.push({
            clipId: clip.id,
            clipName: clip.name || `Clip ${slotIdx}`,
            clipType: clip.clipType || 'video',
            trackName: track.name,
            trackType: track.trackType || 'video',
            startTimeMs: clip.startTimeMs,
            endTimeMs: clip.endTimeMs,
            durationMs: clipDuration,
            isSlot: true, // Default to replaceable slot
            label: defaultLabel,
            type: initialType,
            isRequired: true,
            description: '',
            displayOrder: slotIdx,
          });

          slotIdx++;
        }
      }
    }

    setSlotConfigs(extractedConfigs);
  }, [isOpen, project, timeline]);

  if (!isOpen) return null;

  // Read-only project statistics
  const totalClipsCount = slotConfigs.length;
  const totalTracksCount = timeline?.tracks?.length || 0;
  const projectDurationSec = ((timeline?.totalDurationMs || project.durationMs || 0) / 1000).toFixed(1);
  const activeSlotsCount = slotConfigs.filter((s) => s.isSlot).length;
  const fixedClipsCount = slotConfigs.filter((s) => !s.isSlot).length;

  const handleToggleSlot = (clipId: string) => {
    setSlotConfigs((prev) =>
      prev.map((item) => (item.clipId === clipId ? { ...item, isSlot: !item.isSlot } : item))
    );
  };

  const handleUpdateSlot = (clipId: string, updates: Partial<EditableSlotConfig>) => {
    setSlotConfigs((prev) =>
      prev.map((item) => (item.clipId === clipId ? { ...item, ...updates } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setError('Please provide a valid template name.');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Template name must be 100 characters or fewer.');
      return;
    }

    // Validate any active slots
    for (const slot of slotConfigs) {
      if (slot.isSlot && !slot.label.trim()) {
        setError(`Please provide a label for slot "${slot.clipName}".`);
        return;
      }
      if (slot.isSlot && slot.label.trim().length > 80) {
        setError(`Slot label "${slot.label}" cannot exceed 80 characters.`);
        return;
      }
    }

    if (!accessToken) {
      setError('Session expired or authentication token missing.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Map slot configurations for backend project-to-template conversion service
      const payloadSlots: ProjectToTemplateSlotConfig[] = slotConfigs.map((cfg) => ({
        targetClipId: cfg.clipId,
        isSlot: cfg.isSlot,
        slotKey: `slot_${cfg.displayOrder}_${cfg.type}`,
        label: cfg.label.trim(),
        type: cfg.type,
        description: cfg.description.trim() || undefined,
        isRequired: cfg.isRequired,
        displayOrder: cfg.displayOrder,
      }));

      const res = await fetch(`/api/templates/from-project/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          templateName: trimmedName,
          description: description.trim() || undefined,
          category,
          isPublic,
          slotConfigurations: payloadSlots,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save project as template.');
      }

      const result = await res.json();
      setCreatedTemplateResult(result);

      if (onSuccess && result.template) {
        onSuccess(result.template);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating template.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSlotTypeIcon = (type: TemplateSlotType) => {
    switch (type) {
      case 'audio':
        return <Music className="w-3.5 h-3.5 text-amber-400" />;
      case 'image':
      case 'logo':
        return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      case 'text':
      case 'caption':
        return <Type className="w-3.5 h-3.5 text-sky-400" />;
      default:
        return <Video className="w-3.5 h-3.5 text-[#C7C9CC]" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={createdTemplateResult ? onClose : undefined}
          className="fixed inset-0 bg-[#080909]/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
          className="relative z-10 w-full max-w-2xl max-h-[92vh] flex flex-col my-auto"
        >
          <Surface
            level={4}
            className="border-[#3A3C3F] bg-[#141516] shadow-[0_24px_64px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden rounded-xl"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#F2F2F0]">
                  <LayoutTemplate className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    Save Project as Template
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Extract a reusable video editing recipe with customizable media inputs
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-[#202123] transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If template created successfully, render clear feedback view */}
            {createdTemplateResult ? (
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-lg">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-white tracking-tight">Template Created Successfully!</h4>
                  <p className="text-xs text-zinc-300 max-w-md mt-1">
                    Your project's layout, timing, transforms, and slot definitions have been saved as an immutable, reusable template recipe.
                  </p>
                </div>

                <div className="rounded-xl border border-[#292B2D] bg-[#080909] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-[#1B1C1E]">
                    <span className="text-zinc-400">Template Name:</span>
                    <span className="font-semibold text-white">{createdTemplateResult.template?.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-[#1B1C1E]">
                    <span className="text-zinc-400">Category:</span>
                    <span className="capitalize text-[#C7C9CC]">{createdTemplateResult.template?.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-[#1B1C1E]">
                    <span className="text-zinc-400">Aspect Ratio / Resolution:</span>
                    <span className="font-mono text-zinc-300">
                      {createdTemplateResult.template?.aspectRatio} • {project.resolution}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-[#1B1C1E]">
                    <span className="text-zinc-400">Version Number:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      v{createdTemplateResult.version?.versionNumber || 1} (Immutable)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Reusable Media Slots:</span>
                    <span className="font-semibold text-[#F2F2F0]">
                      {createdTemplateResult.version?.slots?.length || activeSlotsCount} Defined
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-[#171819] border border-[#3A3C3F] p-3 text-xs text-[#B4B6B9] flex items-start gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-[#C7C9CC] mt-0.5" />
                  <span>
                    The original project "{project.name}" remains intact and unchanged in your workspace. You can continue editing your current project freely.
                  </span>
                </div>

                <div className="pt-2 flex justify-end">
                  <MotionButton variant="silver" size="md" onClick={onClose}>
                    Done / Return to Workspace
                  </MotionButton>
                </div>
              </div>
            ) : (
              /* Configuration Form */
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-140px)]">
                  {/* Read-Only Project Summary Badges */}
                  <div className="rounded-lg bg-[#080909] border border-[#292B2D] p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-zinc-400">Source:</span>
                      <span className="text-xs font-semibold text-white truncate max-w-[180px] sm:max-w-xs">
                        {project.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <Badge variant="outline" className="border-[#3A3C3F] bg-[#1B1C1E] text-[#C7C9CC]">
                        {project.aspectRatio}
                      </Badge>
                      <span className="px-2 py-0.5 rounded bg-[#141516] text-[#C7C9CC] border border-[#292B2D]">
                        {project.resolution} • {project.fps}fps
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#141516] text-[#C7C9CC] border border-[#292B2D]">
                        {projectDurationSec}s
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#1B1C1E] text-white border border-[#3A3C3F]">
                        {totalTracksCount} tracks • {totalClipsCount} clips
                      </span>
                    </div>
                  </div>

                  {error && (
                    <FeedbackBanner
                      type="error"
                      title="Validation Error"
                      message={error}
                      onDismiss={() => setError(null)}
                    />
                  )}

                  {/* Section 1: Template Metadata */}
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="template-name" className="block text-xs font-semibold text-zinc-200 mb-1.5">
                        Template Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="template-name"
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="e.g. Minimalist Travel Vlog Intro"
                        maxLength={100}
                        required
                        className="w-full px-3 py-2 text-sm bg-[#080909] border border-[#292B2D] rounded-lg text-white placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                      />
                      <div className="flex justify-between items-center mt-1 text-[11px] text-zinc-500">
                        <span>Distinctive title for finding and reusing this template</span>
                        <span>{templateName.length}/100</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="template-category" className="block text-xs font-semibold text-zinc-200 mb-1.5">
                          Category
                        </label>
                        <select
                          id="template-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                          className="w-full px-3 py-2 text-sm bg-[#080909] border border-[#292B2D] rounded-lg text-white focus:outline-none focus:border-[#686B70] transition-colors"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value} className="bg-[#141516] text-white">
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col justify-end">
                        <label className="flex items-center gap-2 cursor-pointer select-none py-2">
                          <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="rounded border-[#292B2D] bg-[#080909] text-[#C7C9CC] focus:ring-[#C7C9CC] w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs text-zinc-300 font-medium">Make Available Publicly</span>
                        </label>
                        <p className="text-[10px] text-zinc-500">Public templates can be discovered by all users</p>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="template-description" className="block text-xs font-semibold text-zinc-200 mb-1.5">
                        Description <span className="text-zinc-500 font-normal">(Optional)</span>
                      </label>
                      <textarea
                        id="template-description"
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief summary of intended usage, layout style, and pacing..."
                        maxLength={500}
                        className="w-full px-3 py-2 text-sm bg-[#080909] border border-[#292B2D] rounded-lg text-white placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] transition-colors resize-none"
                      />
                    </div>
                  </div>

                  {/* Section 2: Template Slot Identification */}
                  <div className="space-y-3 pt-2 border-t border-[#292B2D]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-[#C7C9CC]" />
                          Template Slots & Media Inputs
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Specify which project elements are replaceable inputs vs fixed content.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-[#3A3C3F] bg-[#1B1C1E] text-[#C7C9CC] text-[10px] font-mono">
                        {activeSlotsCount} Replaceable • {fixedClipsCount} Fixed
                      </Badge>
                    </div>

                    {slotConfigs.length === 0 ? (
                      <div className="p-4 rounded-lg bg-[#080909] border border-[#292B2D] text-center text-xs text-zinc-400">
                        No timeline clips found in this project.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                        {slotConfigs.map((slot, index) => {
                          const durationSec = (slot.durationMs / 1000).toFixed(1);
                          return (
                            <div
                              key={slot.clipId}
                              className={`p-3.5 rounded-lg border transition-all ${
                                slot.isSlot
                                  ? 'bg-[#171819] border-[#3A3C3F]'
                                  : 'bg-[#0B0C0D] border-[#202123] opacity-80'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-mono text-zinc-500 w-4">#{index + 1}</span>
                                  <div className="p-1 rounded bg-[#1B1C1E] border border-[#3A3C3F]">
                                    {getSlotTypeIcon(slot.type)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-white truncate max-w-[200px] sm:max-w-xs">
                                      {slot.clipName}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-mono">
                                      {slot.trackName} • {durationSec}s
                                    </div>
                                  </div>
                                </div>

                                {/* Slot / Fixed Toggle */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSlot(slot.clipId)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                                      slot.isSlot
                                        ? 'bg-[#252628] text-[#F2F2F0] border border-[#686B70] hover:border-[#C7C9CC]'
                                        : 'bg-[#141516] text-[#777A7E] border border-[#292B2D] hover:text-white'
                                    }`}
                                    aria-label={`Toggle slot mode for ${slot.clipName}`}
                                  >
                                    {slot.isSlot ? (
                                      <>
                                        <Sparkles className="w-3 h-3 text-[#C7C9CC]" />
                                        <span>Replaceable Slot</span>
                                      </>
                                    ) : (
                                      <>
                                        <Lock className="w-3 h-3 text-zinc-400" />
                                        <span>Fixed Content</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Slot Customization when enabled */}
                              {slot.isSlot ? (
                                <div className="mt-2.5 pt-2.5 border-t border-[#292B2D] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  <div className="sm:col-span-2">
                                    <label className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                                      Slot Label / Prompt
                                    </label>
                                    <input
                                      type="text"
                                      value={slot.label}
                                      onChange={(e) => handleUpdateSlot(slot.clipId, { label: e.target.value })}
                                      placeholder="e.g. Hero Video, Logo, Voiceover"
                                      maxLength={80}
                                      className="w-full px-2.5 py-1 text-xs bg-[#080909] border border-[#292B2D] rounded text-white focus:outline-none focus:border-[#686B70]"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                                      Media Type
                                    </label>
                                    <select
                                      value={slot.type}
                                      onChange={(e) =>
                                        handleUpdateSlot(slot.clipId, {
                                          type: e.target.value as TemplateSlotType,
                                        })
                                      }
                                      className="w-full px-2 py-1 text-xs bg-[#080909] border border-[#292B2D] rounded text-white focus:outline-none focus:border-[#686B70]"
                                    >
                                      <option value="video">Video</option>
                                      <option value="audio">Audio</option>
                                      <option value="image">Image</option>
                                      <option value="text">Text / Title</option>
                                      <option value="logo">Logo</option>
                                    </select>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                                  <span>
                                    Fixed element: timing, layout, and transforms will be preserved in the template snapshot without creating a media replacement slot.
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
                  <MotionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </MotionButton>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-400 hidden sm:inline">
                      {activeSlotsCount} slots will be generated
                    </span>
                    <MotionButton
                      type="submit"
                      variant="silver"
                      size="sm"
                      disabled={isSubmitting || !templateName.trim()}
                      isLoading={isSubmitting}
                      leftIcon={<LayoutTemplate className="w-3.5 h-3.5" />}
                    >
                      {isSubmitting ? 'Creating Template...' : 'Save as Template'}
                    </MotionButton>
                  </div>
                </div>
              </form>
            )}
          </Surface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
