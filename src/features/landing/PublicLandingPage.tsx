import React from 'react';
import { Surface, MotionButton, Badge } from '../../components/ui';
import { ClipperLogo } from '../../components/ClipperLogo';
import {
  Film,
  Sparkles,
  Layers,
  LayoutTemplate,
  Play,
  ArrowRight,
  Shield,
  Monitor,
  Smartphone,
  Square,
  Volume2,
  Type,
  Video,
} from 'lucide-react';

interface PublicLandingPageProps {
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onReplayIntro?: () => void;
  onReplayShowcase?: () => void;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  onOpenAuth,
  onReplayIntro,
  onReplayShowcase,
}) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#080909] text-[#F2F2F0] flex flex-col font-sans selection:bg-[#C7C9CC] selection:text-[#0B0C0D]">
      {/* 1. PUBLIC TOP NAVIGATION */}
      <header className="border-b border-[#292B2D] bg-[#0B0C0D]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Clipper Brand & Logo */}
          <div className="flex items-center gap-3">
            <ClipperLogo size="sm" showDescriptor />
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[#92969C]">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-[#F2F2F0] transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('templates')}
              className="hover:text-[#F2F2F0] transition-colors cursor-pointer"
            >
              Templates
            </button>
          </nav>

          {/* Public Auth CTA Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <MotionButton
              variant="ghost"
              size="sm"
              onClick={() => onOpenAuth('signin')}
            >
              Sign In
            </MotionButton>
            <MotionButton
              variant="silver"
              size="sm"
              onClick={() => onOpenAuth('signup')}
            >
              Get Started
            </MotionButton>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden pt-16 sm:pt-24 pb-16 px-4 sm:px-6">
        {/* Subtle Ambient Graphite/Silver Radial Lighting */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-b from-white/[0.04] via-[#C7C9CC]/[0.02] to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />

        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2">
            <Badge variant="outline" className="border-[#3A3C3F] bg-[#141516] text-[#C7C9CC] text-xs py-1 px-3">
              <Sparkles className="w-3.5 h-3.5 text-[#C7C9CC]" />
              AI-Powered Cinematic Video Editor
            </Badge>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#F2F2F0] uppercase">
            Create. Edit. Reuse.
          </h1>

          <p className="max-w-2xl mx-auto text-sm sm:text-base text-[#B4B6B9] leading-relaxed">
            Clipper is a cinematic video editor engineered with reusable editing templates. Assemble multi-track timelines, define customizable slots, and effortlessly produce video variations directly in your browser.
          </p>

          {/* Primary & Secondary CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <MotionButton
              variant="silver"
              size="lg"
              onClick={() => onOpenAuth('signup')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="w-full sm:w-auto"
            >
              Start Creating
            </MotionButton>

            <MotionButton
              variant="outline"
              size="lg"
              onClick={() => scrollToSection('templates')}
              className="w-full sm:w-auto text-[#C7C9CC] border-[#3A3C3F] hover:border-[#686B70]"
            >
              Explore Templates
            </MotionButton>
          </div>
        </div>

        {/* Studio Viewport Preview Mockup */}
        <div className="max-w-5xl mx-auto mt-12 sm:mt-16">
          <Surface level={2} className="border-[#292B2D] p-3 sm:p-5 rounded-xl shadow-[0_32px_80px_rgba(0,0,0,0.85)] bg-[#101112]">
            {/* Window Chrome Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#292B2D] text-xs text-[#92969C]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3A3C3F] inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#4E5053] inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#686B70] inline-block" />
                <span className="ml-2 font-mono text-[11px] text-[#C7C9CC]">Clipper Studio — 1080p @ 60fps</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-[#F2F2F0] font-semibold">00:00:04:15</span>
                <span className="text-[#4E5053]">/</span>
                <span className="text-[#92969C]">00:00:15:00</span>
              </div>
            </div>

            {/* Video Viewport Stage */}
            <div className="mt-3 bg-[#080909] rounded-lg aspect-video flex flex-col items-center justify-center relative overflow-hidden border border-[#292B2D]">
              <div className="absolute inset-0 bg-[radial-gradient(#202123_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
              <div className="relative z-10 text-center space-y-2 p-6">
                <div className="w-14 h-14 rounded-full bg-[#1B1C1E] border border-[#3A3C3F] text-[#F2F2F0] flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(0,0,0,0.6)]">
                  <Play className="w-6 h-6 fill-[#C7C9CC] ml-0.5 text-[#C7C9CC]" />
                </div>
                <div className="text-xs uppercase tracking-widest text-[#C7C9CC] font-mono font-semibold">
                  Live Canvas Preview
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-[#F2F2F0] tracking-tight">
                  High-Impact Cinematic Teaser
                </h3>
              </div>
            </div>

            {/* Simulated Multi-Track Timeline */}
            <div className="mt-3 pt-3 border-t border-[#292B2D] space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1">
                  <Video className="w-3 h-3 text-[#C7C9CC]" /> Track 1
                </div>
                <div className="flex-1 h-6 bg-[#0B0C0D] rounded border border-[#292B2D] flex items-center px-2 gap-1 overflow-hidden">
                  <div className="h-4 w-44 bg-[#1B1C1E] border border-[#3A3C3F] rounded text-[9px] font-mono text-[#F2F2F0] flex items-center px-1.5 truncate">
                    Hook Footage (Video Slot)
                  </div>
                  <div className="h-4 w-52 bg-[#171819] border border-[#292B2D] rounded text-[9px] font-mono text-[#B4B6B9] flex items-center px-1.5 truncate">
                    Product Demo Clip
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1">
                  <Type className="w-3 h-3 text-[#B4B6B9]" /> Track 2
                </div>
                <div className="flex-1 h-6 bg-[#0B0C0D] rounded border border-[#292B2D] flex items-center px-2 gap-1 overflow-hidden">
                  <div className="h-4 w-32 bg-[#202123] border border-[#3A3C3F] rounded text-[9px] font-mono text-[#F2F2F0] flex items-center px-1.5 truncate">
                    Headline (Text Slot)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-20 text-[10px] font-mono text-[#777A7E] flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-[#92969C]" /> Track 3
                </div>
                <div className="flex-1 h-6 bg-[#0B0C0D] rounded border border-[#292B2D] flex items-center px-2 gap-1 overflow-hidden">
                  <div className="h-4 w-80 bg-[#171819] border border-[#292B2D] rounded text-[9px] font-mono text-[#92969C] flex items-center px-1.5 truncate">
                    Cinematic Score (Audio Track)
                  </div>
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </section>

      {/* 3. CORE FEATURES SECTION */}
      <section id="features" className="py-20 px-4 sm:px-6 border-t border-[#292B2D] bg-[#0B0C0D]">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#F2F2F0]">
              Engineered for Speed & Reusability
            </h2>
            <p className="text-xs sm:text-sm text-[#92969C] max-w-xl mx-auto">
              Every feature in Clipper is tailored for creators who need professional multi-track control without starting every video from scratch.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Feature 1 */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-5 space-y-3 hover:border-[#686B70] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-[#1B1C1E] text-[#C7C9CC] flex items-center justify-center border border-[#3A3C3F]">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#F2F2F0]">Multi-Track Timeline</h3>
              <p className="text-xs text-[#92969C] leading-relaxed">
                Layer video, audio, title text, and brand assets. Split, trim, and reorder clips with millisecond precision.
              </p>
            </Surface>

            {/* Feature 2 */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-5 space-y-3 hover:border-[#686B70] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-[#1B1C1E] text-[#C7C9CC] flex items-center justify-center border border-[#3A3C3F]">
                <LayoutTemplate className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#F2F2F0]">Reusable Template Recipes</h3>
              <p className="text-xs text-[#92969C] leading-relaxed">
                Convert any finished timeline into an immutable template. Expose typed slots for dynamic footage and captions.
              </p>
            </Surface>

            {/* Feature 3 */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-5 space-y-3 hover:border-[#686B70] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-[#1B1C1E] text-[#C7C9CC] flex items-center justify-center border border-[#3A3C3F]">
                <Play className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#F2F2F0]">Real-Time Browser Preview</h3>
              <p className="text-xs text-[#92969C] leading-relaxed">
                Smooth playback engine with interactive playhead scrubbing, instant preview, and multi-format canvas aspect ratios.
              </p>
            </Surface>

            {/* Feature 4 */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-5 space-y-3 hover:border-[#686B70] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-[#1B1C1E] text-[#C7C9CC] flex items-center justify-center border border-[#3A3C3F]">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#F2F2F0]">High-Speed Cloud Storage</h3>
              <p className="text-xs text-[#92969C] leading-relaxed">
                Fast direct-to-cloud media uploads with streaming playback and encrypted, versioned timeline persistence.
              </p>
            </Surface>
          </div>
        </div>
      </section>

      {/* 4. TEMPLATES SHOWCASE SECTION */}
      <section id="templates" className="py-20 px-4 sm:px-6 border-t border-[#292B2D] bg-[#080909]">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="border-[#3A3C3F] bg-[#141516] text-[#C7C9CC] text-xs py-0.5 px-2.5">
                Layout Recipes
              </Badge>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#F2F2F0]">
              Built for Every Screen Format
            </h2>
            <p className="text-xs sm:text-sm text-[#92969C] max-w-xl mx-auto">
              Choose from standardized aspect ratio templates engineered with customizable slots.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 16:9 Format Card */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-6 rounded-xl flex flex-col justify-between hover:border-[#686B70] transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#92969C]">
                  <div className="flex items-center gap-1.5 font-medium text-[#F2F2F0]">
                    <Monitor className="w-4 h-4 text-[#C7C9CC]" />
                    <span>16:9 Widescreen</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-[#292B2D]">
                    3 Slots
                  </Badge>
                </div>

                <div className="w-full aspect-video bg-[#080909] border border-[#292B2D] rounded-lg p-3 flex flex-col justify-between">
                  <div className="h-3 w-24 bg-[#1B1C1E] border border-[#3A3C3F] rounded text-[9px] font-mono text-[#C7C9CC] flex items-center px-1">
                    [slot] Logo SVG
                  </div>
                  <div className="text-center space-y-1">
                    <div className="h-4 w-40 bg-[#252628] rounded mx-auto text-[9px] font-mono text-[#F2F2F0] flex items-center justify-center">
                      [slot] Headline Text
                    </div>
                  </div>
                  <div className="h-3 w-full bg-[#1B1C1E] border border-[#3A3C3F] rounded text-[9px] font-mono text-[#92969C] flex items-center px-1 truncate">
                    [slot] Background Video Loop
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-[#F2F2F0]">Product Demo & Keynote</h4>
                  <p className="text-xs text-[#92969C]">
                    Engineered for software walkthroughs, YouTube features, and company announcements.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <MotionButton
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenAuth('signup')}
                  className="w-full text-xs"
                >
                  Start with 16:9
                </MotionButton>
              </div>
            </Surface>

            {/* 9:16 Vertical Card */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-6 rounded-xl flex flex-col justify-between hover:border-[#686B70] transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#92969C]">
                  <div className="flex items-center gap-1.5 font-medium text-[#F2F2F0]">
                    <Smartphone className="w-4 h-4 text-[#C7C9CC]" />
                    <span>9:16 Vertical Reel</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-[#292B2D]">
                    2 Slots
                  </Badge>
                </div>

                <div className="w-36 mx-auto aspect-[9/16] bg-[#080909] border border-[#292B2D] rounded-lg p-2.5 flex flex-col justify-between">
                  <div className="h-3 w-full bg-[#1B1C1E] border border-[#3A3C3F] rounded text-[8px] font-mono text-[#C7C9CC] flex items-center px-1 truncate">
                    [slot] Hook Video
                  </div>
                  <div className="h-4 w-full bg-[#252628] rounded text-[8px] font-mono text-[#F2F2F0] flex items-center justify-center">
                    [slot] Bold Caption
                  </div>
                  <div className="h-2.5 w-full bg-[#171819] rounded text-[8px] font-mono text-[#777A7E] flex items-center px-1">
                    Beat Sync
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-[#F2F2F0]">Viral Hook & Shorts</h4>
                  <p className="text-xs text-[#92969C]">
                    Fast-paced vertical layout recipe optimized for TikTok, Instagram Reels, and YouTube Shorts.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <MotionButton
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenAuth('signup')}
                  className="w-full text-xs"
                >
                  Start with 9:16
                </MotionButton>
              </div>
            </Surface>

            {/* 1:1 Square Card */}
            <Surface level={2} className="border-[#292B2D] bg-[#141516] p-6 rounded-xl flex flex-col justify-between hover:border-[#686B70] transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#92969C]">
                  <div className="flex items-center gap-1.5 font-medium text-[#F2F2F0]">
                    <Square className="w-4 h-4 text-[#C7C9CC]" />
                    <span>1:1 Square Feed</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-[#292B2D]">
                    2 Slots
                  </Badge>
                </div>

                <div className="w-44 mx-auto aspect-square bg-[#080909] border border-[#292B2D] rounded-lg p-3 flex flex-col justify-between">
                  <div className="h-3 w-28 bg-[#1B1C1E] border border-[#3A3C3F] rounded text-[9px] font-mono text-[#C7C9CC] flex items-center px-1">
                    [slot] Soundbite Wave
                  </div>
                  <div className="h-14 w-full bg-[#101112] border border-[#292B2D] rounded flex items-center justify-center text-[9px] font-mono text-[#777A7E]">
                    Center Media Focus
                  </div>
                  <div className="h-3 w-full bg-[#252628] rounded text-[9px] font-mono text-[#F2F2F0] flex items-center justify-center">
                    [slot] Quote Text
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-[#F2F2F0]">Feed Ad & Podcast Snippet</h4>
                  <p className="text-xs text-[#92969C]">
                    Balanced square composition for Instagram feeds, LinkedIn thought-leadership, and audio snippets.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <MotionButton
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenAuth('signup')}
                  className="w-full text-xs"
                >
                  Start with 1:1
                </MotionButton>
              </div>
            </Surface>
          </div>
        </div>
      </section>

      {/* 5. CALL TO ACTION BANNER */}
      <section className="py-16 px-4 sm:px-6 border-t border-[#292B2D] bg-[#0B0C0D]">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F2F2F0] tracking-tight uppercase">
            Stop Rebuilding. Start Reusing.
          </h2>
          <p className="text-xs sm:text-sm text-[#92969C] max-w-lg mx-auto">
            Create high-velocity video workflows with full multi-track timeline control and reusable templates.
          </p>
          <div className="pt-2">
            <MotionButton
              variant="silver"
              size="lg"
              onClick={() => onOpenAuth('signup')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Start Creating Now
            </MotionButton>
          </div>
        </div>
      </section>

      {/* 6. CLEAN FOOTER */}
      <footer className="mt-auto border-t border-[#292B2D] py-8 px-4 sm:px-6 bg-[#080909] text-xs text-[#777A7E]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#C7C9CC]">Clipper</span>
            <span>·</span>
            <span>AI-Powered Cinematic Video Studio</span>
          </div>

          <div className="flex items-center gap-4">
            {onReplayShowcase && (
              <button
                onClick={onReplayShowcase}
                className="text-[11px] text-[#777A7E] hover:text-[#C7C9CC] transition-colors cursor-pointer"
                title="Replay cinematic product showcase tour"
              >
                Product Tour
              </button>
            )}
            {onReplayIntro && (
              <button
                onClick={onReplayIntro}
                className="text-[11px] text-[#777A7E] hover:text-[#C7C9CC] transition-colors cursor-pointer"
                title="Replay cinematic brand introduction"
              >
                Replay Brand Intro
              </button>
            )}
            <span>© {new Date().getFullYear()} Clipper Studio. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
