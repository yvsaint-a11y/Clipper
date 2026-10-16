import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Surface, MotionButton, Badge, FeedbackBanner, EmptyState } from '@/src/components/ui';
import { ProjectCard, ProjectItem } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import {
  Film,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Monitor,
  Smartphone,
  Square,
  Lock,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';

export interface ProjectDashboardProps {
  onSelectProject?: (project: ProjectItem) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ onSelectProject }) => {
  const { user, accessToken } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [aspectFilter, setAspectFilter] = useState<'all' | '16:9' | '9:16' | '1:1'>('all');

  const fetchProjects = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch projects.');
      }

      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading projects.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchProjects();
    } else {
      setProjects([]);
    }
  }, [accessToken]);

  const handleDuplicate = async (project: ProjectItem) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to duplicate project.');
      }

      setSuccess(`Duplicated "${project.name}" successfully.`);
      await fetchProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Duplication error.');
    }
  };

  const handleDelete = async (project: ProjectItem) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to archive project.');
      }

      setSuccess(`Archived "${project.name}".`);
      await fetchProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deletion error.');
    }
  };

  const handleRename = async (project: ProjectItem, newName: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: newName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rename project.');
      }

      setSuccess(`Renamed project to "${newName}".`);
      await fetchProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rename error.');
    }
  };

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesAspect = aspectFilter === 'all' || p.aspectRatio === aspectFilter;
    return matchesSearch && matchesAspect;
  });

  return (
    <div className="space-y-6">
      {/* Top Action & Control Bar */}
      <Surface level={2} className="p-5 border-[#2e374f]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Film className="w-5 h-5 text-[#C7C9CC]" />
              <h2 className="text-lg font-bold text-white tracking-tight">Studio Project Workspace</h2>
              <Badge variant="outline" className="text-[10px] font-mono border-[#3A3C3F] text-zinc-300">
                PostgreSQL + Drizzle
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              Manage your video timeline projects, formats, resolutions, and canonical version snapshots.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <>
                <MotionButton
                  variant="outline"
                  size="sm"
                  onClick={fetchProjects}
                  disabled={isLoading}
                  leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
                >
                  Sync
                </MotionButton>
                <MotionButton
                  variant="silver"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  New Project
                </MotionButton>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        {user && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-[#292B2D]">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search projects by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] text-zinc-400 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3" /> Format:
              </span>
              {(['all', '16:9', '9:16', '1:1'] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectFilter(ratio)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer capitalize ${
                    aspectFilter === ratio
                      ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] font-medium shadow-xs'
                      : 'bg-[#141516] border border-[#292B2D] text-[#92969C] hover:text-[#F2F2F0]'
                  }`}
                >
                  {ratio === 'all' ? 'All Formats' : ratio}
                </button>
              ))}
            </div>
          </div>
        )}
      </Surface>

      {/* Status Notifications */}
      {error && (
        <FeedbackBanner
          type="error"
          title="Project Workspace Notice"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {success && (
        <FeedbackBanner
          type="success"
          title="Operation Succeeded"
          message={success}
          onDismiss={() => setSuccess(null)}
        />
      )}

      {/* Grid or Empty States */}
      {!user ? (
        <EmptyState
          icon={<Lock className="w-6 h-6 text-[#92969C]" />}
          title="Authentication Required"
          description="Sign in to your Clipper studio account to load your video projects, versions, and timelines."
        />
      ) : isLoading && projects.length === 0 ? (
        <Surface level={1} className="p-12 text-center border-[#292B2D]">
          <RefreshCw className="w-6 h-6 text-[#C7C9CC] animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#92969C]">Loading your project library from PostgreSQL...</p>
        </Surface>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Film className="w-6 h-6 text-[#C7C9CC]" />}
          title={searchQuery || aspectFilter !== 'all' ? 'No Matching Projects' : 'No Projects Created Yet'}
          description={
            searchQuery || aspectFilter !== 'all'
              ? 'Try adjusting your search terms or format filter.'
              : 'Create your first video project to establish canvas dimensions, fps, and timeline tracks.'
          }
          action={
            <MotionButton
              variant="primary"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Create New Project
            </MotionButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={(proj) => {
                if (onSelectProject) onSelectProject(proj);
              }}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        accessToken={accessToken}
        onCreated={(newProj) => {
          setSuccess(`Project "${newProj.name}" created successfully.`);
          fetchProjects();
        }}
      />
    </div>
  );
};
