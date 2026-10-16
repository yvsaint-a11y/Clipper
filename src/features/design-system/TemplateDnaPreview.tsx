import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { motionTokens } from '@/src/lib/designTokens';
import { MotionButton, Surface, Badge } from '@/src/components/ui';
import { Sparkles, Film, Type, Image as ImageIcon, Sliders, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';

export const TemplateDnaPreview: React.FC = () => {
  const [stage, setStage] = useState<'project' | 'deconstructing' | 'template'>('project');

  const handleStartDeconstruction = () => {
    setStage('deconstructing');
    setTimeout(() => {
      setStage('template');
    }, 1400);
  };

  const handleReset = () => {
    setStage('project');
  };

  return (
    <Surface level={2} className="p-6 relative overflow-hidden border-[#2e374f]">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#242b3d]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-white tracking-wide">
              Signature Interaction: "Save Project as Template" (DNA Extraction)
            </h4>
          </div>
          <p className="text-xs text-zinc-400">
            D3 Spatial & D4 Reactive Transformation: Project elements visually reorganize from active content into reusable template structure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stage === 'template' ? (
            <MotionButton
              variant="outline"
              size="xs"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={handleReset}
            >
              Reset Simulation
            </MotionButton>
          ) : (
            <MotionButton
              variant="primary"
              size="xs"
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              disabled={stage === 'deconstructing'}
              isLoading={stage === 'deconstructing'}
              onClick={handleStartDeconstruction}
            >
              Extract Template DNA
            </MotionButton>
          )}
        </div>
      </div>

      {/* Visual Canvas Simulator */}
      <div className="relative h-64 w-full bg-[#0b0c13] rounded-xl border border-[#1b1f2e] p-4 flex flex-col justify-between overflow-hidden">
        {/* Stage Status Badge */}
        <div className="flex justify-between items-center z-10">
          <Badge variant={stage === 'template' ? 'success' : 'default'}>
            {stage === 'project' && 'Mode: Active Project Video'}
            {stage === 'deconstructing' && 'Mode: Deconstructing Abstract Syntax Tree...'}
            {stage === 'template' && 'Mode: Reusable Template Matrix'}
          </Badge>

          <span className="text-[11px] font-mono text-zinc-500">
            {stage === 'project' && 'Timeline Composition: 1080x1920 @ 60fps'}
            {stage === 'deconstructing' && 'Analyzing asset dependencies...'}
            {stage === 'template' && 'Schema: template_v1_dna.json'}
          </span>
        </div>

        {/* Dynamic Canvas Elements Morphing */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-auto z-10">
          {/* Element 1: Main Video -> Media Slot */}
          <motion.div
            layout
            transition={{ duration: motionTokens.duration.spatial, ease: motionTokens.ease.spatial }}
            className={`p-3 rounded-lg border transition-colors ${
              stage === 'template'
                ? 'bg-indigo-950/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                : 'bg-[#181d2c] border-[#2c344a]'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-medium text-zinc-200">
                {stage === 'template' ? 'Slot: {{background_video}}' : 'clip_intro_hero.mp4'}
              </span>
            </div>
            <div className="h-14 rounded bg-[#0e1017] border border-white/[0.05] flex items-center justify-center text-[11px] text-zinc-400">
              {stage === 'template' ? (
                <span className="text-indigo-300 font-mono">Dynamic Slot [Video/Image]</span>
              ) : (
                <span>1080x1920 • 00:00 - 00:08</span>
              )}
            </div>
          </motion.div>

          {/* Element 2: Lower Third Text -> Dynamic Prop */}
          <motion.div
            layout
            transition={{ duration: motionTokens.duration.spatial, ease: motionTokens.ease.spatial }}
            className={`p-3 rounded-lg border transition-colors ${
              stage === 'template'
                ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'bg-[#181d2c] border-[#2c344a]'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Type className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-zinc-200">
                {stage === 'template' ? 'Slot: {{headline_text}}' : '"Next-Gen AI Editor"'}
              </span>
            </div>
            <div className="h-14 rounded bg-[#0e1017] border border-white/[0.05] flex items-center justify-center text-[11px] text-zinc-400">
              {stage === 'template' ? (
                <span className="text-amber-300 font-mono">Text Param [Editable]</span>
              ) : (
                <span>Inter Bold 64px • Fade In</span>
              )}
            </div>
          </motion.div>

          {/* Element 3: Watermark Logo -> Branding Parameter */}
          <motion.div
            layout
            transition={{ duration: motionTokens.duration.spatial, ease: motionTokens.ease.spatial }}
            className={`p-3 rounded-lg border transition-colors ${
              stage === 'template'
                ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-[#181d2c] border-[#2c344a]'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-200">
                {stage === 'template' ? 'Slot: {{brand_watermark}}' : 'client_logo.svg'}
              </span>
            </div>
            <div className="h-14 rounded bg-[#0e1017] border border-white/[0.05] flex items-center justify-center text-[11px] text-zinc-400">
              {stage === 'template' ? (
                <span className="text-emerald-300 font-mono">Brand Asset Slot</span>
              ) : (
                <span>Top-Right • 80% Opacity</span>
              )}
            </div>
          </motion.div>
        </div>

        {/* Footer Timeline Track Representation */}
        <div className="z-10 flex items-center justify-between pt-2 border-t border-[#1b1f2e] text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-zinc-500" />
            <span>Structured Track: Track 1 (V) • Track 2 (T) • Track 3 (A)</span>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-400">
            {stage === 'template' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Template DNA Ready for Remotion / Cloud Renders</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
};
