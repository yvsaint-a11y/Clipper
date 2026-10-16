import React, { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { PublicLandingPage } from '../features/landing/PublicLandingPage';
import { ProjectDashboard } from '../features/projects/ProjectDashboard';
import { ProjectWorkspace } from '../features/projects/ProjectWorkspace';
import { CreateProjectModal } from '../features/projects/CreateProjectModal';
import { TemplateLibrary } from '../features/templates/TemplateLibrary';
import { MediaManager } from '../features/media/MediaManager';
import { AuthModal, type AuthModalMode } from '../features/auth/AuthModal';
import { DeveloperDiagnosticsModal } from './DeveloperDiagnosticsModal';
import { ProjectItem } from '../features/projects/ProjectCard';
import { ClipperLogo } from './ClipperLogo';
import { Surface, MotionButton, Badge } from './ui';
import {
  FolderOpen,
  LayoutTemplate,
  Film,
  Plus,
  LogOut,
  Wrench,
  CheckCircle2,
} from 'lucide-react';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  architecture: {
    auth: string;
    database: string;
    storage: string;
    renderer: string;
    queue: string;
    billing: string;
  };
  capabilities: {
    maxExportResolution: string;
    templateSlotSupport: boolean;
    directR2Upload: boolean;
  };
  servicesConfigured?: {
    supabase: boolean;
    database: boolean;
    r2: boolean;
    redis: boolean;
    stripe: boolean;
    sentry: boolean;
  };
}

interface AppShellProps {
  onOpenArchitecture?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ onOpenArchitecture }) => {
  const { user, profile, accessToken, signOut, isConfigured: isSupabaseReady, isPasswordRecovery } = useAuth();

  // Navigation & Workspace State
  const [activeTab, setActiveTab] = useState<'projects' | 'templates' | 'media'>('projects');
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);

  // Modals & Panels
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signin');
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  // Backend Health state for diagnostics
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);

  // If password recovery link was clicked and loaded into app
  useEffect(() => {
    if (isPasswordRecovery) {
      setAuthModalMode('reset_password');
      setIsAuthModalOpen(true);
    }
  }, [isPasswordRecovery]);

  // Check URL query parameters for dev diagnostic mode (?dev=true)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === 'true') {
        setIsDiagnosticsOpen(true);
      }
    }
  }, []);

  // Keyboard shortcut listener for dev diagnostics: Ctrl+Shift+D or Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDiagnosticsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchHealth = async () => {
    setIsLoadingHealth(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data: HealthResponse = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.warn('[AppShell] Health fetch warning:', err);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  // =========================================================================
  // 1. UNAUTHENTICATED PUBLIC VISITOR EXPERIENCE (Part 1 & Part 6)
  // =========================================================================
  if (!user) {
    return (
      <>
        <PublicLandingPage
          onOpenAuth={(mode) => {
            setAuthModalMode(mode);
            setIsAuthModalOpen(true);
          }}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        />

        {/* Global Auth Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          defaultMode={authModalMode}
        />

        {/* Internal Developer Diagnostics (Accessible via discrete footer link) */}
        <DeveloperDiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
          health={health}
          isLoadingHealth={isLoadingHealth}
          onRefreshHealth={fetchHealth}
          isSupabaseReady={isSupabaseReady}
          user={user}
        />
      </>
    );
  }

  // =========================================================================
  // 2. AUTHENTICATED PRODUCT SHELL EXPERIENCE (Part 2, Part 6 & Part 7)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#080909] text-[#F2F2F0] flex flex-col font-sans selection:bg-[#C7C9CC] selection:text-[#0B0C0D]">
      {/* Top Customer-Facing Navigation Bar */}
      <header className="border-b border-[#292B2D] bg-[#0B0C0D]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
          {/* Logo & Primary Tabs */}
          <div className="flex items-center gap-2.5 sm:gap-6 shrink-0">
            <button
              onClick={() => {
                setActiveTab('projects');
                setActiveProject(null);
              }}
              className="flex items-center text-left cursor-pointer group shrink-0"
              aria-label="Clipper Home"
            >
              <ClipperLogo size="sm" showDescriptor={false} className="sm:hidden" />
              <ClipperLogo size="sm" showDescriptor={true} className="hidden sm:inline-flex" />
            </button>

            {/* Primary Product Navigation */}
            <nav className="flex items-center gap-1 bg-[#141516] p-1 rounded-xl border border-[#292B2D] shrink-0">
              <button
                onClick={() => {
                  setActiveTab('projects');
                  setActiveProject(null);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                  activeTab === 'projects'
                    ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-[0_1px_4px_rgba(0,0,0,0.6)]'
                    : 'text-[#92969C] hover:text-[#F2F2F0] hover:bg-[#202123]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Projects</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('templates');
                  setActiveProject(null);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                  activeTab === 'templates'
                    ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-[0_1px_4px_rgba(0,0,0,0.6)]'
                    : 'text-[#92969C] hover:text-[#F2F2F0] hover:bg-[#202123]'
                }`}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                <span>Templates</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('media');
                  setActiveProject(null);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                  activeTab === 'media'
                    ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-[0_1px_4px_rgba(0,0,0,0.6)]'
                    : 'text-[#92969C] hover:text-[#F2F2F0] hover:bg-[#202123]'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Media</span>
              </button>
            </nav>
          </div>

          {/* Right Action & Account Area */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Action: New Project */}
            <MotionButton
              variant="silver"
              size="sm"
              onClick={() => setIsCreateProjectModalOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              className="hidden sm:inline-flex"
            >
              New Project
            </MotionButton>

            {/* Account Details & Sign Out */}
            <div className="flex items-center gap-2 sm:gap-2.5 bg-[#141516] border border-[#292B2D] rounded-xl px-2 sm:px-2.5 py-1 text-xs">
              <div className="w-6 h-6 rounded-full bg-[#252628] border border-[#3A3C3F] text-[#F2F2F0] flex items-center justify-center text-[10px] font-bold shrink-0">
                {user.email?.[0].toUpperCase() || 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-[11px] font-medium text-[#F2F2F0] truncate max-w-[130px]">
                  {profile?.displayName || user.email}
                </div>
                <div className="text-[9px] font-mono text-[#92969C] capitalize">
                  {profile?.subscriptionTier || 'free'} tier
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="h-7 w-7 text-[#777A7E] hover:text-[#F2F2F0] hover:bg-[#202123] rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Product Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 py-3 sm:py-8 overflow-x-hidden min-w-0">
        {/* Tab 1: Projects & Full Video Editor Workspace */}
        {activeTab === 'projects' && (
          activeProject ? (
            <ProjectWorkspace
              project={activeProject}
              onBack={() => setActiveProject(null)}
            />
          ) : (
            <ProjectDashboard
              onSelectProject={(proj) => setActiveProject(proj)}
            />
          )
        )}

        {/* Tab 2: Reusable Template Library */}
        {activeTab === 'templates' && (
          <TemplateLibrary
            onNavigateToProjects={() => {
              setActiveTab('projects');
              setActiveProject(null);
            }}
            onOpenProject={(proj) => {
              setActiveProject(proj);
              setActiveTab('projects');
            }}
          />
        )}

        {/* Tab 3: Cloud Media Storage */}
        {activeTab === 'media' && <MediaManager />}
      </main>

      {/* Product Footer with Discreet Developer Diagnostics Link */}
      <footer className="border-t border-[#292B2D] py-6 px-4 sm:px-6 bg-[#0B0C0D] text-xs text-[#777A7E] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#C7C9CC]">Clipper Cinematic Studio</span>
            <span>·</span>
            <span>PostgreSQL & Cloudflare R2 Connected</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="text-[11px] text-[#777A7E] hover:text-[#C7C9CC] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Open internal developer diagnostics (Ctrl+Shift+D)"
            >
              <Wrench className="w-3 h-3" />
              <span>Developer Diagnostics</span>
            </button>
            <span>© {new Date().getFullYear()} Clipper Studio</span>
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authModalMode}
      />

      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
        onCreated={(newProj) => {
          setActiveProject(newProj);
          setActiveTab('projects');
          setIsCreateProjectModalOpen(false);
        }}
        accessToken={accessToken}
      />

      <DeveloperDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        health={health}
        isLoadingHealth={isLoadingHealth}
        onRefreshHealth={fetchHealth}
        isSupabaseReady={isSupabaseReady}
        user={user}
      />
    </div>
  );
};
