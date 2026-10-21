import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClipperLogo } from '@/src/components/ClipperLogo';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Play,
  Pause,
  Video,
  Type,
  Volume2,
  LayoutTemplate,
  Layers,
  Sparkles,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';

export interface CinematicProductShowcaseProps {
  /** Called when visitor completes the tour or clicks a skip/continue action */
  onComplete: () => void;
  /** Duration in milliseconds per step before auto-advancing (default: 4000ms) */
  autoAdvanceMs?: number;
}

interface TourStep {
  id: string;
  badge: string;
  title: string;
  tagline: string;
  description: string;
  highlightSlot?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'create',
    badge: 'STEP 01 — CREATE',
    title: 'Start Projects & Organize Media',
    tagline: 'Zero-friction media ingestion and workspace setup',
    description:
      'Initialize multi-track timelines for any aspect ratio (16:9, 9:16, 1:1) and ingest high-bitrate video, image, and audio assets with instantaneous browser playback.',
    highlightSlot: 'media_bins',
  },
  {
    id: 'edit',
    badge: 'STEP 02 — EDIT',
    title: 'Multi-Track Precision Editing',
    tagline: 'Frame-accurate timeline, text overlays, and audio envelopes',
    description:
      'Arrange sequential clips, split and trim with millisecond precision, apply cinematic text overlays, and calibrate frame-accurate audio volume fade curves.',
    highlightSlot: 'timeline_editing',
  },
  {
    id: 'save_template',
    badge: 'STEP 03 — SAVE YOUR TEMPLATE',
    title: 'Preserve The Editing Recipe',
    tagline: 'An immutable editing blueprint, not a rendered video',
    description:
      'Lock your timeline pacing, graphic positions, and audio fade curves into a reusable editing recipe. Define typed slots for footage, headlines, and background music.',
    highlightSlot: 'template_recipe',
  },
  {
    id: 'reuse',
    badge: 'STEP 04 — REUSE',
    title: 'One Recipe. Infinite Variations.',
    tagline: 'The ultimate editing multiplier',
    description:
      'Apply your saved template to brand-new projects in seconds. Swap footage and copy into predefined slots—your signature pacing, typography, and music cuts stay 100% intact.',
    highlightSlot: 'slot_swap',
  },
];

export const CinematicProductShowcase: React.FC<CinematicProductShowcaseProps> = ({
  onComplete,
  autoAdvanceMs = 4200,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Guards to prevent double callbacks
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect reduced-motion preference
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      }
    }
  }, []);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onCompleteRef.current();
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (prev >= TOUR_STEPS.length - 1) {
        handleComplete();
        return prev;
      }
      return prev + 1;
    });
  }, [handleComplete]);

  const handlePrev = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleSelectStep = (index: number) => {
    setCurrentStepIndex(index);
    setIsPaused(true); // User interaction pauses automatic advancement
  };

  // Keyboard navigation listener (ArrowRight, ArrowLeft, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPaused(true);
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPaused(true);
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleComplete]);

  // Automatic progression logic (paused upon explicit interaction or reduced motion option)
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      handleNext();
    }, autoAdvanceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentStepIndex, isPaused, autoAdvanceMs, handleNext]);

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFinalStep = currentStepIndex === TOUR_STEPS.length - 1;

  return (
    <div
      role="region"
      aria-label="Clipper Cinematic Product Tour"
      className="fixed inset-0 z-[90] flex flex-col bg-[#080909] text-[#F2F2F0] overflow-y-auto selection:bg-[#C7C9CC] selection:text-[#0B0C0D]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 1. TOP CINEMATIC HEADER */}
      <header className="border-b border-[#292B2D] bg-[#0B0C0D]/90 backdrop-blur-md sticky top-0 z-30 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipperLogo size="sm" showDescriptor />
          </div>

          {/* Center: Stage Progress Tracker */}
          <div className="hidden md:flex items-center gap-2">
            {TOUR_STEPS.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => handleSelectStep(idx)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                  idx === currentStepIndex
                    ? 'bg-[#1B1C1E] text-[#F2F2F0] border border-[#3A3C3F] shadow-[0_1px_4px_rgba(0,0,0,0.6)]'
                    : idx < currentStepIndex
                    ? 'text-[#C7C9CC] hover:bg-[#141516]'
                    : 'text-[#777A7E] hover:text-[#92969C]'
                }`}
                aria-label={`Jump to ${step.badge}`}
                aria-current={idx === currentStepIndex ? 'step' : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>0{idx + 1}</span>
              </button>
            ))}
          </div>

          {/* Right: Pause / Skip to Auth Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="p-1.5 rounded-lg text-[#777A7E] hover:text-[#C7C9CC] hover:bg-[#141516] border border-transparent hover:border-[#292B2D] text-xs transition-colors cursor-pointer"
              title={isPaused ? 'Resume auto-play' : 'Pause tour'}
              aria-label={isPaused ? 'Resume auto-play' : 'Pause tour'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleComplete}
              className="px-3 py-1.5 rounded-lg bg-[#141516] hover:bg-[#1B1C1E] border border-[#292B2D] hover:border-[#686B70] text-[#92969C] hover:text-[#F2F2F0] text-xs font-medium transition-colors cursor-pointer"
              aria-label="Skip product showcase to login"
            >
              <span>Skip Tour</span>
              <span className="hidden sm:inline-block ml-1.5 text-[10px] text-[#777A7E]">[Esc]</span>
            </button>
          </div>
        </div>

        {/* Step Progress Bar across header bottom */}
        {!prefersReducedMotion && (
          <div className="h-0.5 w-full bg-[#141516]" aria-hidden="true">
            <div
              className="h-full bg-gradient-to-r from-[#92969C] via-[#C7C9CC] to-white transition-all ease-linear"
              style={{
                width: `${((currentStepIndex + 1) / TOUR_STEPS.length) * 100}%`,
                transitionDuration: isPaused ? '0ms' : `${autoAdvanceMs}ms`,
              }}
            />
          </div>
        )}
      </header>

      {/* 2. MAIN CINEMATIC PRESENTATION STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-between">
        {/* Core Product Proposition Header */}
        <div className="text-center max-w-3xl mx-auto space-y-2 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#F2F2F0] uppercase">
            Your Vision. Your Edit. Your Template.
          </h1>
          <p className="text-xs sm:text-sm text-[#B4B6B9] leading-relaxed max-w-xl mx-auto">
            Create professional videos, save your editing workflow as reusable templates, and make your next project easier to produce.
          </p>
        </div>

        {/* Primary Interactive Workspace Demonstration Canvas */}
        <div className="relative rounded-2xl bg-[#0B0C0D] border border-[#292B2D] shadow-[0_24px_64px_rgba(0,0,0,0.85)] p-3 sm:p-5 overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-gradient-to-b from-white/[0.03] to-transparent rounded-full blur-[100px] pointer-events-none"
            aria-hidden="true"
          />

          {/* Window Chrome Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#292B2D] text-xs text-[#92969C]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3A3C3F]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#4E5053]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#686B70]" />
              <span className="ml-2 font-mono text-[11px] text-[#C7C9CC]">
                Clipper Studio — {currentStep.title}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-[#141516] border border-[#292B2D] text-[#C7C9CC]">
                1080p · 60fps
              </span>
              <span className="text-[#F2F2F0] font-semibold">00:00:04:15</span>
              <span className="text-[#4E5053]">/</span>
              <span className="text-[#92969C]">00:00:15:00</span>
            </div>
          </div>

          {/* Central Workspace Demonstration: Video Canvas & Context Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
            {/* Left 8 Cols: Video Viewport */}
            <div className="lg:col-span-8 bg-[#080909] rounded-xl aspect-video border border-[#292B2D] relative overflow-hidden flex flex-col justify-between p-4 sm:p-6">
              {/* Background Grid Pattern */}
              <div className="absolute inset-0 bg-[radial-gradient(#202123_1px,transparent_1px)] [background-size:20px_20px] opacity-40 pointer-events-none" />

              {/* Top Viewport Metadata Overlay */}
              <div className="relative z-10 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#92969C] px-2 py-0.5 rounded bg-[#141516]/80 border border-[#292B2D]">
                  {currentStepIndex === 0 && 'Media Pool · Ingest Active'}
                  {currentStepIndex === 1 && 'Live Preview · Realtime Playback'}
                  {currentStepIndex === 2 && 'Template Recipe Mode · Slot Parameterization'}
                  {currentStepIndex === 3 && 'Variation Engine · 1-Click Replacement'}
                </span>

                {currentStepIndex === 3 && (
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Pacing Preserved
                  </span>
                )}
              </div>

              {/* Dynamic Viewport Stage Content per Step */}
              <div className="relative z-10 my-auto text-center space-y-3">
                {currentStepIndex === 0 && (
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-lg bg-[#141516] border border-[#3A3C3F] text-left space-y-1">
                        <FolderOpen className="w-4 h-4 text-[#C7C9CC]" />
                        <div className="text-[10px] font-mono text-[#F2F2F0]">A-Roll Clip</div>
                        <div className="text-[9px] text-[#777A7E]">1080p · 240MB</div>
                      </div>
                      <div className="p-3 rounded-lg bg-[#141516] border border-[#3A3C3F] text-left space-y-1">
                        <Type className="w-4 h-4 text-[#C7C9CC]" />
                        <div className="text-[10px] font-mono text-[#F2F2F0]">Headline Title</div>
                        <div className="text-[9px] text-[#777A7E]">Bold Editorial</div>
                      </div>
                      <div className="p-3 rounded-lg bg-[#141516] border border-[#3A3C3F] text-left space-y-1">
                        <Volume2 className="w-4 h-4 text-[#C7C9CC]" />
                        <div className="text-[10px] font-mono text-[#F2F2F0]">Beat Track</div>
                        <div className="text-[9px] text-[#777A7E]">128 BPM WAV</div>
                      </div>
                    </div>
                    <div className="text-xs text-[#92969C] font-mono pt-1">
                      Organized into fast browser bins for zero-wait editing
                    </div>
                  </div>
                )}

                {currentStepIndex === 1 && (
                  <div className="space-y-3">
                    <div className="w-16 h-16 rounded-full bg-[#1B1C1E] border border-[#3A3C3F] text-[#F2F2F0] flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(0,0,0,0.7)]">
                      <Play className="w-7 h-7 fill-[#C7C9CC] ml-1 text-[#C7C9CC]" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#F2F2F0] tracking-tight">
                      Smooth Multi-Track Playback
                    </h3>
                    <p className="text-xs text-[#92969C] max-w-sm mx-auto">
                      Millisecond playhead tracking, frame-accurate trimming, and audio fades.
                    </p>
                  </div>
                )}

                {currentStepIndex === 2 && (
                  <div className="p-4 rounded-xl bg-[#141516]/90 border border-[#3A3C3F] max-w-md mx-auto space-y-2.5 text-left">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#F2F2F0] font-semibold flex items-center gap-1.5">
                        <LayoutTemplate className="w-3.5 h-3.5 text-[#C7C9CC]" /> Save Timeline as Template
                      </span>
                      <span className="text-amber-400 text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/60">
                        Editing Recipe
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div className="p-1.5 rounded bg-[#1B1C1E] border border-dashed border-[#686B70] flex items-center justify-between text-[#C7C9CC]">
                        <span>[Slot 1] Hero Video Footage</span>
                        <span className="text-[10px] text-[#777A7E]">Dynamic Clip</span>
                      </div>
                      <div className="p-1.5 rounded bg-[#1B1C1E] border border-dashed border-[#686B70] flex items-center justify-between text-[#C7C9CC]">
                        <span>[Slot 2] Main Hook Caption</span>
                        <span className="text-[10px] text-[#777A7E]">Dynamic Text</span>
                      </div>
                      <div className="p-1.5 rounded bg-[#1B1C1E] border border-dashed border-[#686B70] flex items-center justify-between text-[#C7C9CC]">
                        <span>[Slot 3] Cinematic Soundtrack</span>
                        <span className="text-[10px] text-[#777A7E]">Dynamic Audio</span>
                      </div>
                    </div>
                  </div>
                )}

                {currentStepIndex === 3 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
                      <div className="p-3 rounded-xl bg-[#141516] border border-[#292B2D] space-y-1.5">
                        <div className="text-[10px] font-mono text-[#777A7E]">Original Project</div>
                        <div className="text-xs font-bold text-[#C7C9CC]">Episode 01 — London</div>
                        <div className="h-10 bg-[#1B1C1E] rounded flex items-center justify-center text-[10px] font-mono text-[#777A7E]">
                          Footage A + Text A
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#141516] border border-emerald-800/80 shadow-[0_0_16px_rgba(16,185,129,0.15)] space-y-1.5">
                        <div className="text-[10px] font-mono text-emerald-400">Template Variation</div>
                        <div className="text-xs font-bold text-[#F2F2F0]">Episode 02 — Tokyo</div>
                        <div className="h-10 bg-[#1B1C1E] rounded border border-dashed border-emerald-500/40 flex items-center justify-center text-[10px] font-mono text-emerald-300">
                          Footage B + Text B
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-[#C7C9CC] font-mono font-medium">
                      Exact same rhythm & structure in 30 seconds instead of 4 hours
                    </div>
                  </div>
                )}
              </div>

              {/* Viewport Bottom Playhead Track Indicator */}
              <div className="relative z-10 pt-2 flex items-center justify-between text-[11px] font-mono text-[#777A7E]">
                <span>Stage Progress</span>
                <span className="text-[#C7C9CC]">{currentStep.badge}</span>
              </div>
            </div>

            {/* Right 4 Cols: Tour Stage Explanation Panel */}
            <div className="lg:col-span-4 flex flex-col justify-between p-4 sm:p-6 rounded-xl bg-[#141516] border border-[#292B2D]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#C7C9CC] bg-[#1B1C1E] px-2.5 py-1 rounded-md border border-[#3A3C3F]">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span>{currentStep.badge}</span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F2F2F0]">
                    {currentStep.title}
                  </h2>
                  <p className="text-xs font-mono text-[#C7C9CC]">{currentStep.tagline}</p>
                </div>

                <p className="text-xs sm:text-sm text-[#92969C] leading-relaxed">
                  {currentStep.description}
                </p>
              </div>

              {/* Stage Navigation & Call-To-Action */}
              <div className="pt-6 border-t border-[#292B2D] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={currentStepIndex === 0}
                    className="p-2 rounded-lg bg-[#1B1C1E] hover:bg-[#252628] disabled:opacity-30 disabled:pointer-events-none border border-[#292B2D] text-[#C7C9CC] hover:text-white transition-colors cursor-pointer"
                    aria-label="Previous tour step"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {isFinalStep ? (
                    <button
                      type="button"
                      onClick={handleComplete}
                      className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-white via-[#E5E7EB] to-[#C7C9CC] hover:from-[#F2F2F0] hover:to-white text-[#0B0C0D] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_2px_12px_rgba(255,255,255,0.2)] transition-all cursor-pointer"
                    >
                      <span>Start Creating</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex-1 py-2.5 px-4 rounded-lg bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] hover:border-[#686B70] text-[#F2F2F0] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>Next Step</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleComplete}
                    className="text-[11px] text-[#777A7E] hover:text-[#C7C9CC] transition-colors cursor-pointer"
                  >
                    Already have an account? Sign In
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Simulated Timeline Visualization */}
          <div className="mt-4 pt-4 border-t border-[#292B2D] space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#777A7E] px-2">
              <span>00:00</span>
              <span>00:03</span>
              <span>00:06</span>
              <span>00:09</span>
              <span>00:12</span>
              <span>00:15</span>
            </div>

            {/* Track 1: Video Track */}
            <div className="flex items-center gap-2">
              <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1 shrink-0">
                <Video className="w-3 h-3 text-[#C7C9CC]" /> Track 1
              </div>
              <div className="flex-1 h-7 bg-[#080909] rounded-lg border border-[#292B2D] flex items-center px-1.5 gap-1.5 overflow-hidden">
                <div
                  className={`h-5 rounded px-2 text-[9px] font-mono flex items-center transition-all ${
                    currentStepIndex === 3
                      ? 'w-48 bg-emerald-950/60 border border-emerald-600/70 text-emerald-200'
                      : 'w-44 bg-[#1B1C1E] border border-[#3A3C3F] text-[#F2F2F0]'
                  }`}
                >
                  {currentStepIndex === 3 ? '[Reused Slot] Tokyo Hook' : '[Slot] Hero Video Clip'}
                </div>
                <div className="h-5 w-52 bg-[#171819] border border-[#292B2D] rounded px-2 text-[9px] font-mono text-[#92969C] flex items-center">
                  Product Overview B-Roll
                </div>
              </div>
            </div>

            {/* Track 2: Typography Overlay */}
            <div className="flex items-center gap-2">
              <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1 shrink-0">
                <Type className="w-3 h-3 text-[#92969C]" /> Track 2
              </div>
              <div className="flex-1 h-7 bg-[#080909] rounded-lg border border-[#292B2D] flex items-center px-1.5 gap-1.5 overflow-hidden">
                <div
                  className={`h-5 rounded px-2 text-[9px] font-mono flex items-center transition-all ${
                    currentStepIndex === 3
                      ? 'w-36 bg-emerald-950/60 border border-emerald-600/70 text-emerald-200'
                      : 'w-32 bg-[#202123] border border-[#3A3C3F] text-[#F2F2F0]'
                  }`}
                >
                  {currentStepIndex === 3 ? '[Reused Slot] Tokyo Title' : '[Slot] Main Headline'}
                </div>
              </div>
            </div>

            {/* Track 3: Audio Envelope Track */}
            <div className="flex items-center gap-2">
              <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1 shrink-0">
                <Volume2 className="w-3 h-3 text-[#777A7E]" /> Track 3
              </div>
              <div className="flex-1 h-7 bg-[#080909] rounded-lg border border-[#292B2D] flex items-center px-1.5 gap-1.5 overflow-hidden">
                <div className="h-5 w-80 bg-[#171819] border border-[#292B2D] rounded px-2 text-[9px] font-mono text-[#92969C] flex items-center justify-between">
                  <span>Cinematic Master Score</span>
                  <span className="text-[8px] text-[#777A7E]">Fade 1.2s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
