import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Surface,
  ParallaxContainer,
  SpatialTransition,
  MotionButton,
  FeedbackBanner,
  EmptyState,
  Badge,
  Input,
} from '@/src/components/ui';
import { colors, elevation, radii, spacing, motionTokens } from '@/src/lib/designTokens';
import { TemplateDnaPreview } from './TemplateDnaPreview';
import {
  Sparkles,
  Layers,
  Palette,
  Type,
  MousePointer,
  Move,
  Maximize2,
  Minimize2,
  Box,
  Eye,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Flame,
  FileVideo,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';

export const DesignSystemShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tokens' | 'surfaces' | 'motion' | 'feedback' | 'templateDna'>('tokens');
  const [spatialModalOpen, setSpatialModalOpen] = useState(false);
  const [simulatedLoading, setSimulatedLoading] = useState(false);
  const [interactiveGlow, setInteractiveGlow] = useState<'none' | 'indigo' | 'emerald' | 'amber'>('indigo');

  const triggerLoading = () => {
    setSimulatedLoading(true);
    setTimeout(() => setSimulatedLoading(false), 2000);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <Surface level={2} className="p-6 relative overflow-hidden border-[#2e374f]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Phase 4: 5D Cinematic Creative Studio Design System
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Cinematic Creative Studio Design System
            </h2>
            <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Precision design primitives crafted for professional video production tools. Incorporates the 5D UI Interaction model: D1 Depth, D2 Parallax, D3 Spatial Transitions, D4 Reactive Surfaces, and D5 Micro-interactions.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs px-2.5 py-1 rounded bg-[#0b0c13] border border-[#242b3d] text-zinc-400 font-mono">
              WCAG AA Compliant
            </span>
            <span className="text-xs px-2.5 py-1 rounded bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-mono">
              prefers-reduced-motion
            </span>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-5 border-t border-[#242b3d]">
          <button
            onClick={() => setActiveTab('tokens')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tokens'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0e1017]/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Design Tokens & Scales</span>
          </button>
          <button
            onClick={() => setActiveTab('surfaces')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'surfaces'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0e1017]/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>5D Surfaces & Depth</span>
          </button>
          <button
            onClick={() => setActiveTab('motion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'motion'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0e1017]/60'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Parallax & Spatial Motion</span>
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'feedback'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0e1017]/60'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Feedback, Errors & Empty States</span>
          </button>
          <button
            onClick={() => setActiveTab('templateDna')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'templateDna'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0e1017]/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Signature Template DNA Motion</span>
          </button>
        </div>
      </Surface>

      {/* Tab 1: Design Tokens & Typography */}
      {activeTab === 'tokens' && (
        <div className="space-y-6">
          {/* Colors Spectrum */}
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">Cinematic Dark Color Palette</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Deep neutral charcoal canvas paired with high-contrast typography and restrained cinematic indigo accents.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg border border-[#242b3d] bg-[#090a0f]">
                <div className="text-xs font-semibold text-white">#090a0f</div>
                <div className="text-[11px] text-zinc-400">Canvas Base</div>
              </div>
              <div className="p-3 rounded-lg border border-[#242b3d] bg-[#0e1017]">
                <div className="text-xs font-semibold text-white">#0e1017</div>
                <div className="text-[11px] text-zinc-400">Secondary Bg</div>
              </div>
              <div className="p-3 rounded-lg border border-[#242b3d] bg-[#141722]">
                <div className="text-xs font-semibold text-white">#141722</div>
                <div className="text-[11px] text-zinc-400">Surface 1</div>
              </div>
              <div className="p-3 rounded-lg border border-[#242b3d] bg-[#1a1e2d]">
                <div className="text-xs font-semibold text-white">#1a1e2d</div>
                <div className="text-[11px] text-zinc-400">Surface 2</div>
              </div>
              <div className="p-3 rounded-lg border border-[#242b3d] bg-[#202638]">
                <div className="text-xs font-semibold text-white">#202638</div>
                <div className="text-[11px] text-zinc-400">Overlay 3</div>
              </div>
              <div className="p-3 rounded-lg border border-indigo-500/50 bg-[#6366f1]">
                <div className="text-xs font-semibold text-white">#6366f1</div>
                <div className="text-[11px] text-indigo-100">Indigo Accent</div>
              </div>
            </div>
          </Surface>

          {/* Typography Scale */}
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">Typography & Numeric Hierarchy</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Optimized for high-density video timeline inspection and metadata scanning.
            </p>

            <div className="space-y-4 divide-y divide-[#242b3d]/60">
              <div className="pt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-zinc-400">Display Header (24px / 1.3)</span>
                <span className="text-2xl font-bold text-white tracking-tight">4K Timeline Render Engine</span>
              </div>
              <div className="pt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-zinc-400">Section Header (18px / 1.4)</span>
                <span className="text-lg font-semibold text-zinc-100">Media Tracks & Dynamic Overlays</span>
              </div>
              <div className="pt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-zinc-400">Body Primary (14px / 1.6)</span>
                <span className="text-sm text-zinc-300">
                  Each frame is computed deterministically using Remotion and Cloudflare R2 object storage.
                </span>
              </div>
              <div className="pt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-zinc-400">Technical Numeric (Mono 12px)</span>
                <span className="text-xs font-mono text-indigo-300">00:04:12:18 • 1920x1080@60fps • 45.2 MB</span>
              </div>
            </div>
          </Surface>
        </div>
      )}

      {/* Tab 2: 5D Surfaces & Depth */}
      {activeTab === 'surfaces' && (
        <div className="space-y-6">
          <Surface level={1} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">D1 Depth & Elevation Levels</h3>
                <p className="text-xs text-zinc-400">
                  Calculated border contrast and shadows provide visual layering without artificial blur degradation.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400 mr-1">Test Glow:</span>
                {(['none', 'indigo', 'emerald', 'amber'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setInteractiveGlow(g)}
                    className={`text-[11px] px-2 py-0.5 rounded capitalize ${
                      interactiveGlow === g ? 'bg-indigo-600 text-white' : 'bg-[#1a1e2d] text-zinc-400'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Surface level={1} glow={interactiveGlow} interactive className="p-4">
                <Badge variant="outline" className="mb-2">Level 1</Badge>
                <div className="text-sm font-semibold text-zinc-200">Base Panel</div>
                <div className="text-xs text-zinc-400 mt-1">Timeline container & sidebars</div>
              </Surface>

              <Surface level={2} glow={interactiveGlow} interactive className="p-4">
                <Badge variant="default" className="mb-2">Level 2</Badge>
                <div className="text-sm font-semibold text-zinc-200">Raised Surface</div>
                <div className="text-xs text-zinc-400 mt-1">Active clips, selected properties</div>
              </Surface>

              <Surface level={3} glow={interactiveGlow} interactive className="p-4">
                <Badge variant="default" className="mb-2">Level 3</Badge>
                <div className="text-sm font-semibold text-zinc-200">Floating Surface</div>
                <div className="text-xs text-zinc-400 mt-1">Toolbars & dropdown menus</div>
              </Surface>
            </div>
          </Surface>

          {/* D4 Reactive Buttons & Micro-interactions */}
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">D4 Reactive Buttons & Tactile Feedback</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Tactile scale feedback (scale down on press, subtle lift on hover) engineered with spring physics.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <MotionButton variant="primary" size="md" leftIcon={<Sparkles className="w-4 h-4" />}>
                Primary Action
              </MotionButton>
              <MotionButton variant="secondary" size="md">
                Secondary Surface
              </MotionButton>
              <MotionButton variant="outline" size="md">
                Outline Control
              </MotionButton>
              <MotionButton variant="glass" size="md">
                Glass Floating
              </MotionButton>
              <MotionButton
                variant="primary"
                size="md"
                isLoading={simulatedLoading}
                onClick={triggerLoading}
              >
                Click for Loading State
              </MotionButton>
            </div>
          </Surface>
        </div>
      )}

      {/* Tab 3: Parallax & Spatial Motion */}
      {activeTab === 'motion' && (
        <div className="space-y-6">
          {/* D2 Parallax Demonstration */}
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">D2 Subtle Parallax Canvas</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Smooth pointer-tracked perspective with requestAnimationFrame spring interpolation. Automatically disabled when prefers-reduced-motion is active.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ParallaxContainer depth={14} className="h-64 rounded-xl overflow-hidden border border-[#2e374f] bg-[#0b0c13] p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <Badge variant="default">3D Parallax Perspective Card</Badge>
                  <span className="text-xs text-zinc-500 font-mono">Move mouse over card</span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-white">Cinematic Project Card</h4>
                  <p className="text-xs text-zinc-300">
                    Hover and move pointer to test calibrated 3D rotational tilt and depth separation.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#1b1f2e] text-xs text-zinc-400">
                  <span>Aspect: 16:9 • 4K Video</span>
                  <MotionButton variant="glass" size="xs">
                    Inspect Asset
                  </MotionButton>
                </div>
              </ParallaxContainer>

              {/* D3 Spatial Transition Preview */}
              <div className="h-64 rounded-xl border border-[#2e374f] bg-[#0e1017] p-6 flex flex-col justify-between">
                <div>
                  <Badge variant="default" className="mb-2">D3 Spatial Expansion</Badge>
                  <h4 className="text-sm font-semibold text-white">Shared Workspace Transition</h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    Interface surfaces expand directly from trigger bounds into modal workspaces.
                  </p>
                </div>

                <SpatialTransition
                  isOpen={spatialModalOpen}
                  onClose={() => setSpatialModalOpen(false)}
                  triggerContent={
                    <MotionButton
                      variant="primary"
                      size="sm"
                      leftIcon={<Maximize2 className="w-3.5 h-3.5" />}
                      onClick={() => setSpatialModalOpen(true)}
                    >
                      Trigger Spatial Modal Expansion
                    </MotionButton>
                  }
                  expandedContent={
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-[#242b3d] pb-3">
                        <div className="flex items-center gap-2">
                          <Box className="w-5 h-5 text-indigo-400" />
                          <h3 className="text-base font-semibold text-white">Expanded Project Inspector</h3>
                        </div>
                        <MotionButton
                          variant="ghost"
                          size="xs"
                          onClick={() => setSpatialModalOpen(false)}
                        >
                          Close (Esc)
                        </MotionButton>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed">
                        This surface transitioned seamlessly from its originating card position into a full focused modal without visual pop or abrupt displacement.
                      </p>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-3 rounded-lg bg-[#0b0c13] border border-[#242b3d]">
                          <span className="text-[11px] text-zinc-500">Render Resolution</span>
                          <div className="text-sm font-semibold text-zinc-200">3840 x 2160 UHD</div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0b0c13] border border-[#242b3d]">
                          <span className="text-[11px] text-zinc-500">Storage Backend</span>
                          <div className="text-sm font-semibold text-zinc-200">Cloudflare R2 Bucket</div>
                        </div>
                      </div>
                    </div>
                  }
                />

                <div className="text-[11px] text-zinc-500 font-mono">
                  Easing: [0.22, 1, 0.36, 1] • Duration: 650ms
                </div>
              </div>
            </div>
          </Surface>
        </div>
      )}

      {/* Tab 4: Feedback States, Empty States & Errors */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">Micro-Feedback Banners</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Polished status notifications communicating operation results without obscuring workspace focus.
            </p>

            <div className="space-y-3">
              <FeedbackBanner
                type="success"
                title="Asset Ingestion Complete"
                message="Video raw/user-123/clip-01.mp4 was successfully verified and synced with PostgreSQL."
              />
              <FeedbackBanner
                type="info"
                title="Presigned URL Active"
                message="Direct Cloudflare R2 S3 transfer URL generated with a 15-minute expiration window."
              />
              <FeedbackBanner
                type="warning"
                title="High Frame Rate Warning"
                message="Source footage is 120fps. Timeline playback will downsample to 60fps for optimal performance."
              />
              <FeedbackBanner
                type="error"
                title="Upload Verification Failed"
                message="MIME type application/x-dosexec is not permitted by media validation policy."
              />
            </div>
          </Surface>

          {/* Empty States */}
          <Surface level={1} className="p-6">
            <h3 className="text-base font-semibold text-white mb-2">Cinematic Empty States</h3>
            <p className="text-xs text-zinc-400 mb-5">
              Non-intrusive empty states that guide user action without visual clutter.
            </p>

            <EmptyState
              icon={<FileVideo className="w-6 h-6 text-indigo-400" />}
              title="No Video Footage Ingested"
              description="Drop MP4, WebM, or MOV files into the workspace to begin structuring your video timeline."
              action={
                <MotionButton variant="primary" size="sm" leftIcon={<Upload className="w-3.5 h-3.5" />}>
                  Upload First Clip
                </MotionButton>
              }
            />
          </Surface>
        </div>
      )}

      {/* Tab 5: Signature Template DNA Animation */}
      {activeTab === 'templateDna' && (
        <TemplateDnaPreview />
      )}
    </div>
  );
};
