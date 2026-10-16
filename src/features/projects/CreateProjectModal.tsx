import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, FeedbackBanner } from '@/src/components/ui';
import { motionTokens } from '@/src/lib/designTokens';
import { Film, Monitor, Smartphone, Square, Sparkles, X, Plus } from 'lucide-react';

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: any) => void;
  accessToken: string | null;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  accessToken,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [fps, setFps] = useState<30 | 60>(30);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name.');
      return;
    }

    if (!accessToken) {
      setError('You must be signed in to create a project.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          aspectRatio,
          fps,
          resolution,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create project.');
      }

      const data = await res.json();
      onCreated(data.project);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Project creation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#080909]/85 backdrop-blur-md"
        />

        {/* Modal Surface */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
          className="relative z-10 w-full max-w-lg"
        >
          <Surface level={4} className="border-[#3A3C3F] bg-[#141516] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9)]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#292B2D]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#F2F2F0]">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Create Video Project</h3>
                  <p className="text-[11px] text-[#92969C]">Establish canonical canvas dimensions and timeline parameters</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mt-4">
                <FeedbackBanner
                  type="error"
                  title="Creation Error"
                  message={error}
                  onDismiss={() => setError(null)}
                />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Summer Commercial Reel 2026"
                  required
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-[#080909] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief project notes or campaign tag..."
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-[#080909] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                />
              </div>

              {/* Aspect Ratio Selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">Aspect Ratio & Target Format</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      aspectRatio === '16:9'
                        ? 'bg-[#1B1C1E] border-[#C7C9CC] text-white shadow-[0_0_12px_rgba(255,255,255,0.12)]'
                        : 'bg-[#080909] border-[#292B2D] text-[#92969C] hover:border-[#686B70]'
                    }`}
                  >
                    <Monitor className="w-4 h-4 mb-2 text-[#C7C9CC]" />
                    <div className="text-xs font-semibold">16:9 Landscape</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">YouTube, Web, TV</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      aspectRatio === '9:16'
                        ? 'bg-[#1B1C1E] border-[#C7C9CC] text-white shadow-[0_0_12px_rgba(255,255,255,0.12)]'
                        : 'bg-[#080909] border-[#292B2D] text-[#92969C] hover:border-[#686B70]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 mb-2 text-[#C7C9CC]" />
                    <div className="text-xs font-semibold">9:16 Vertical</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Shorts, TikTok, Reels</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAspectRatio('1:1')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      aspectRatio === '1:1'
                        ? 'bg-[#1B1C1E] border-[#C7C9CC] text-white shadow-[0_0_12px_rgba(255,255,255,0.12)]'
                        : 'bg-[#080909] border-[#292B2D] text-[#92969C] hover:border-[#686B70]'
                    }`}
                  >
                    <Square className="w-4 h-4 mb-2 text-[#C7C9CC]" />
                    <div className="text-xs font-semibold">1:1 Square</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Instagram Feed</div>
                  </button>
                </div>
              </div>

              {/* Technical Canvas Settings */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Max Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-[#080909] border border-[#292B2D] rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-[#686B70]"
                  >
                    <option value="1080p">1080p Full HD (Standard)</option>
                    <option value="720p">720p HD (Fast Proxy)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Timeline Framerate</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) as any)}
                    className="w-full px-2.5 py-1.5 bg-[#080909] border border-[#292B2D] rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-[#686B70]"
                  >
                    <option value={30}>30 fps (Broadcast standard)</option>
                    <option value={60}>60 fps (Smooth high frame rate)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#292B2D]">
                <MotionButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </MotionButton>
                <MotionButton
                  type="submit"
                  variant="silver"
                  size="sm"
                  isLoading={isSubmitting}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Create Project
                </MotionButton>
              </div>
            </form>
          </Surface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
