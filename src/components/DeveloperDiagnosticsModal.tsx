import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, Card, CardHeader, CardTitle, CardContent, CardDescription, Button } from './ui';
import { DatabaseExplorer } from './DatabaseExplorer';
import { DesignSystemShowcase } from '../features/design-system/DesignSystemShowcase';
import { ArchitecturePortal } from './ArchitecturePortal';
import { useEditorStore } from '../features/editor/stores/useEditorStore';
import {
  X,
  Server,
  Database,
  Palette,
  Layers,
  Code2,
  Sliders,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Wrench,
} from 'lucide-react';

interface DeveloperDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: any;
  isLoadingHealth: boolean;
  onRefreshHealth: () => void;
  isSupabaseReady: boolean;
  user: any;
}

export type DevTab = 'health' | 'database' | 'design' | 'architecture' | 'models' | 'sandbox';

export const DeveloperDiagnosticsModal: React.FC<DeveloperDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  health,
  isLoadingHealth,
  onRefreshHealth,
  isSupabaseReady,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<DevTab>('health');

  // Zustand Store hooks for sandbox
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const zoomLevel = useEditorStore((s) => s.zoomLevel);
  const togglePlayback = useEditorStore((s) => s.togglePlayback);
  const setZoomLevel = useEditorStore((s) => s.setZoomLevel);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#06070a]/85 backdrop-blur-md"
        />

        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          className="relative z-10 w-full max-w-6xl h-[90vh] flex flex-col bg-[#0B0C0D] border border-[#292B2D] rounded-2xl shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#292B2D] bg-[#141516]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Internal Developer Diagnostics</h3>
                  <Badge variant="warning" className="text-[10px] font-mono py-0.5">
                    Dev Only
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Architectural specifications, database explorer, design system tokens, and state sandbox.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Close Diagnostics"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subheader Navigation Tabs */}
          <div className="flex items-center gap-1.5 px-6 py-2.5 bg-[#080909] border-b border-[#292B2D] overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab('health')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'health'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>System & API Health</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'database'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Database Explorer</span>
            </button>

            <button
              onClick={() => setActiveTab('design')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'design'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>5D Design System</span>
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'architecture'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Architecture Blueprint</span>
            </button>

            <button
              onClick={() => setActiveTab('models')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'models'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Canonical Models</span>
            </button>

            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'sandbox'
                  ? 'bg-[#1B1C1E] text-white border border-[#686B70] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Zustand Sandbox</span>
            </button>
          </div>

          {/* Modal Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. HEALTH TAB */}
            {activeTab === 'health' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-white">System Infrastructure & Microservices</h4>
                    <p className="text-xs text-zinc-400">Live health indicators from the Express backend and third-party integrations.</p>
                  </div>
                  <MotionButton
                    variant="secondary"
                    size="sm"
                    onClick={onRefreshHealth}
                    disabled={isLoadingHealth}
                    leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingHealth ? 'animate-spin' : ''}`} />}
                  >
                    Ping Health Endpoint
                  </MotionButton>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Server className="w-4 h-4 text-emerald-400" />
                        Express Backend Engine
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Status</span>
                        <Badge variant={health?.status === 'ok' ? 'success' : 'warning'}>
                          {health?.status || 'Connecting...'}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Uptime</span>
                        <span className="font-mono text-zinc-200">{health?.uptimeSeconds || 0}s</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Environment</span>
                        <span className="font-mono text-zinc-200">{health?.environment || 'unknown'}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <ShieldCheck className="w-4 h-4 text-[#C7C9CC]" />
                        Supabase & JWT Security
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Supabase Auth</span>
                        <Badge variant={health?.servicesConfigured?.supabase ? 'success' : 'warning'}>
                          {health?.servicesConfigured?.supabase ? 'Connected' : 'Pending Keys'}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Client Ready</span>
                        <span className="font-mono text-zinc-200">{isSupabaseReady ? 'Active' : 'Unconfigured'}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>User Token</span>
                        <span className="font-mono text-zinc-200">{user ? 'Verified' : 'Anonymous'}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <HardDrive className="w-4 h-4 text-sky-400" />
                        Cloud Storage & DB
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Database</span>
                        <Badge variant={health?.servicesConfigured?.database ? 'success' : 'warning'}>
                          {health?.servicesConfigured?.database ? 'PostgreSQL Active' : 'Offline'}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Cloudflare R2</span>
                        <Badge variant={health?.servicesConfigured?.r2 ? 'success' : 'warning'}>
                          {health?.servicesConfigured?.r2 ? 'Configured' : 'Credentials Needed'}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Egress Model</span>
                        <span className="font-mono text-zinc-200">Zero-Egress Direct</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* 2. DATABASE EXPLORER TAB */}
            {activeTab === 'database' && (
              <div>
                <DatabaseExplorer />
              </div>
            )}

            {/* 3. DESIGN SYSTEM SHOWCASE TAB */}
            {activeTab === 'design' && (
              <div>
                <DesignSystemShowcase />
              </div>
            )}

            {/* 4. ARCHITECTURE BLUEPRINT TAB */}
            {activeTab === 'architecture' && (
              <div className="bg-[#080909] rounded-xl p-4 border border-[#292B2D]">
                <ArchitecturePortal />
              </div>
            )}

            {/* 5. CANONICAL TIMELINE MODELS TAB */}
            {activeTab === 'models' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-white">Canonical Timeline Data Structures</CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Core domain contracts defined in <code className="text-[#C7C9CC]">/src/types/timeline.ts</code>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-4 rounded-lg bg-[#080909] border border-[#292B2D] space-y-1">
                      <div className="text-[#C7C9CC] font-semibold mb-2">// Timeline Composition</div>
                      <div>id: UUID</div>
                      <div>fps: 24 | 30 | 60</div>
                      <div>durationMs: number</div>
                      <div>tracks: TimelineTrack[]</div>
                      <div>templateSlots?: TemplateSlot[]</div>
                    </div>
                    <div className="p-4 rounded-lg bg-[#080909] border border-[#292B2D] space-y-1">
                      <div className="text-[#C7C9CC] font-semibold mb-2">// Timeline Clip</div>
                      <div>id: UUID</div>
                      <div>type: 'video' | 'audio' | 'text' | 'image'</div>
                      <div>startMs: number</div>
                      <div>durationMs: number</div>
                      <div>sourceOffsetMs: number</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 6. ZUSTAND STORE SANDBOX TAB */}
            {activeTab === 'sandbox' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-white">Zustand Editor Store Sandbox</CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Client-side reactive store testing playhead, zoom, and snapping
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={togglePlayback}>
                      {isPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </Button>
                    <div className="text-xs font-mono text-zinc-300">
                      Playhead: <span className="text-[#C7C9CC]">{currentTimeMs} ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button variant="secondary" size="sm" onClick={() => setZoomLevel(zoomLevel - 10)}>
                        <ZoomOut className="w-3.5 h-3.5" />
                      </Button>
                      <span className="text-xs font-mono text-[#C7C9CC] w-12 text-center">{zoomLevel} px/s</span>
                      <Button variant="secondary" size="sm" onClick={() => setZoomLevel(zoomLevel + 10)}>
                        <ZoomIn className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
