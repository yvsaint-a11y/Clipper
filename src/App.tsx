import React, { useState } from 'react';
import { AppShell } from './components/AppShell';
import { ArchitecturePortal } from './components/ArchitecturePortal';

export default function App() {
  const [view, setView] = useState<'shell' | 'architecture'>('shell');

  if (view === 'architecture') {
    return (
      <div className="relative">
        <div className="fixed top-3 right-4 z-[9999]">
          <button
            onClick={() => setView('shell')}
            className="px-3 py-1.5 rounded-lg bg-[#1B1C1E] hover:bg-[#252628] text-[#F2F2F0] border border-[#686B70] hover:border-[#C7C9CC] text-xs font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.8)] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            ← Back to Clipper Studio
          </button>
        </div>
        <ArchitecturePortal />
      </div>
    );
  }

  return <AppShell onOpenArchitecture={() => setView('architecture')} />;
}
