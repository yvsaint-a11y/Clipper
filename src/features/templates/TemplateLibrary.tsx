import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Surface, MotionButton, Badge, FeedbackBanner, EmptyState } from '@/src/components/ui';
import { TemplateCard } from './components/TemplateCard';
import { TemplateDetailModal } from './components/TemplateDetailModal';
import {
  LayoutTemplate,
  Search,
  RefreshCw,
  Filter,
  Monitor,
  Smartphone,
  Square,
  Lock,
  Globe,
  User,
  SlidersHorizontal,
  X,
  Plus,
} from 'lucide-react';
import type { Template, TemplateCategory } from '@/src/types/template';
import type { AspectRatio } from '@/src/types/project';
import type { ProjectItem } from '../projects/ProjectCard';

export interface TemplateLibraryProps {
  onNavigateToProjects?: () => void;
  onOpenProject?: (project: ProjectItem) => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  onNavigateToProjects,
  onOpenProject,
}) => {
  const { user, accessToken } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [aspectRatioFilter, setAspectRatioFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'community'>('all');

  // Selected template for detail view
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch templates from authenticated backend
  const fetchTemplates = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/templates?includePublic=true', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch templates.');
      }

      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading templates.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchTemplates();
    } else {
      setTemplates([]);
    }
  }, [accessToken]);

  // Client-side filtering & searching
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // 1. Search query match (name, description, category)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = t.name.toLowerCase().includes(q);
        const descMatch = t.description?.toLowerCase().includes(q) || false;
        const catMatch = t.category?.toLowerCase().includes(q) || false;
        if (!nameMatch && !descMatch && !catMatch) {
          return false;
        }
      }

      // 2. Category match
      if (categoryFilter !== 'all') {
        if (t.category?.toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Aspect Ratio match
      if (aspectRatioFilter !== 'all') {
        if (t.aspectRatio !== aspectRatioFilter) {
          return false;
        }
      }

      // 4. Ownership match
      if (ownershipFilter === 'mine') {
        if (!user?.id || t.userId !== user.id) {
          return false;
        }
      } else if (ownershipFilter === 'community') {
        if (t.userId === user?.id && !t.isPublic) {
          return false;
        }
      }

      return true;
    });
  }, [templates, searchQuery, categoryFilter, aspectRatioFilter, ownershipFilter, user?.id]);

  const handleOpenDetail = (template: Template) => {
    setSelectedTemplateId(template.id);
    setIsDetailOpen(true);
  };

  const handleArchiveSuccess = (archivedId: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== archivedId));
    setSuccessMessage('Template archived successfully.');
    if (selectedTemplateId === archivedId) {
      setIsDetailOpen(false);
      setSelectedTemplateId(null);
    }
  };

  const handleDirectArchive = async (template: Template) => {
    if (!accessToken || !user?.id || template.userId !== user.id) return;
    const confirmed = window.confirm(
      `Are you sure you want to archive "${template.name}"? It will be removed from your active library.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to archive template.');
      }

      handleArchiveSuccess(template.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error archiving template.');
    }
  };

  if (!accessToken) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<Lock className="w-8 h-8 text-zinc-400" />}
          title="Authentication Required"
          description="Please sign in to discover, view, and manage video editing templates."
        />
      </div>
    );
  }

  const isFiltered =
    searchQuery.trim().length > 0 ||
    categoryFilter !== 'all' ||
    aspectRatioFilter !== 'all' ||
    ownershipFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Top Banner / Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-[#C7C9CC]" />
            <span>Template Library</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Discover and manage reusable timeline configurations, multi-track layouts, and media slot definitions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <MotionButton
            variant="secondary"
            size="sm"
            onClick={fetchTemplates}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </MotionButton>

          {onNavigateToProjects && (
            <MotionButton
              variant="outline"
              size="sm"
              onClick={onNavigateToProjects}
              className="text-xs border-[#292B2D]"
            >
              Open Projects Dashboard
            </MotionButton>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <FeedbackBanner
          type="error"
          title="Library Notice"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {successMessage && (
        <FeedbackBanner
          type="success"
          title="Success"
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      {/* Search & Filter Toolbar */}
      <Surface level={2} className="p-4 border-[#292B2D] rounded-xl space-y-3 bg-[#101112]">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by title, description, or category..."
              className="w-full pl-9 pr-9 py-2 text-xs bg-[#141516] border border-[#292B2D] rounded-lg text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Ownership Filter Segmented Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#141516] border border-[#292B2D] rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setOwnershipFilter('all')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                ownershipFilter === 'all'
                  ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-sm'
                  : 'text-[#92969C] hover:text-[#F2F2F0]'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setOwnershipFilter('mine')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                ownershipFilter === 'mine'
                  ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-sm'
                  : 'text-[#92969C] hover:text-[#F2F2F0]'
              }`}
            >
              My Templates
            </button>
            <button
              type="button"
              onClick={() => setOwnershipFilter('community')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                ownershipFilter === 'community'
                  ? 'bg-[#252628] text-[#F2F2F0] border border-[#3A3C3F] shadow-sm'
                  : 'text-[#92969C] hover:text-[#F2F2F0]'
              }`}
            >
              Community
            </button>
          </div>
        </div>

        {/* Category & Aspect Ratio Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#292B2D] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[11px]">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-[#141516] border border-[#292B2D] rounded-md text-zinc-200 focus:outline-none focus:border-[#686B70]"
            >
              <option value="all">All Categories</option>
              <option value="social">Social Media</option>
              <option value="marketing">Marketing</option>
              <option value="podcast">Podcast</option>
              <option value="vlog">Vlog</option>
              <option value="gaming">Gaming</option>
              <option value="tutorial">Tutorial</option>
              <option value="corporate">Corporate</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[11px]">Aspect Ratio:</span>
            <select
              value={aspectRatioFilter}
              onChange={(e) => setAspectRatioFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-[#141516] border border-[#292B2D] rounded-md text-zinc-200 focus:outline-none focus:border-[#686B70]"
            >
              <option value="all">All Ratios</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Vertical</option>
              <option value="1:1">1:1 Square</option>
            </select>
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setAspectRatioFilter('all');
                setOwnershipFilter('all');
              }}
              className="text-xs text-[#C7C9CC] hover:text-white ml-auto flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </Surface>

      {/* Loading Skeleton */}
      {isLoading && templates.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-80 rounded-xl bg-[#141516] border border-[#292B2D] animate-pulse p-5 space-y-4"
            >
              <div className="h-5 bg-[#1B1C1E] rounded w-1/3" />
              <div className="h-32 bg-[#101112] rounded-lg" />
              <div className="h-4 bg-[#1B1C1E] rounded w-3/4" />
              <div className="h-3 bg-[#1B1C1E] rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty States */}
      {!isLoading && templates.length === 0 && (
        <div className="p-12 text-center">
          <EmptyState
            icon={<LayoutTemplate className="w-10 h-10 text-[#C7C9CC]" />}
            title="No templates yet"
            description="Save an existing project as a template from the Project Editor to reuse its layout, timing, and media slots later."
          />
          {onNavigateToProjects && (
            <div className="mt-4 flex justify-center">
              <MotionButton
                variant="primary"
                size="sm"
                onClick={onNavigateToProjects}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Go to Projects Dashboard
              </MotionButton>
            </div>
          )}
        </div>
      )}

      {/* No Search / Filter Matches */}
      {!isLoading && templates.length > 0 && filteredTemplates.length === 0 && (
        <div className="p-12 text-center">
          <EmptyState
            icon={<Search className="w-8 h-8 text-zinc-500" />}
            title="No matching templates"
            description={
              searchQuery
                ? `No templates match your search "${searchQuery}". Try a different keyword or reset filters.`
                : 'No templates match the selected filter criteria. Try expanding your filters.'
            }
          />
          <div className="mt-4 flex justify-center">
            <MotionButton
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setAspectRatioFilter('all');
                setOwnershipFilter('all');
              }}
            >
              Reset Filters
            </MotionButton>
          </div>
        </div>
      )}

      {/* Template Grid */}
      {filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const isOwner = Boolean(user?.id && template.userId === user.id);
            return (
              <TemplateCard
                key={template.id}
                template={template}
                isOwner={isOwner}
                onOpen={handleOpenDetail}
                onArchive={isOwner ? handleDirectArchive : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Template Detail Modal */}
      {isDetailOpen && (
        <TemplateDetailModal
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedTemplateId(null);
          }}
          templateId={selectedTemplateId}
          accessToken={accessToken}
          currentUserId={user?.id}
          onArchiveSuccess={handleArchiveSuccess}
          onApplySuccess={(createdProject) => {
            setIsDetailOpen(false);
            setSelectedTemplateId(null);
            if (onOpenProject) {
              onOpenProject(createdProject);
            }
          }}
        />
      )}
    </div>
  );
};
