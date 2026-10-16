import React, { useState } from 'react';
import {
  Layers,
  Cpu,
  Database,
  Film,
  Sparkles,
  CheckCircle2,
  Clock,
  DollarSign,
  Shield,
  Workflow,
  Code2,
  Copy,
  Check,
  ChevronRight,
  ArrowRight,
  Box,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { TECH_STACK, ROADMAP_PHASES, TEMPLATE_SPEC_JSON } from '../data/architectureData';

export const ArchitecturePortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stack' | 'template' | 'flow' | 'roadmap' | 'costs' | 'scope'>('stack');
  const [copied, setCopied] = useState(false);
  const [userCount, setUserCount] = useState<number>(250);
  const [avgRenderMins, setAvgRenderMins] = useState<number>(30);

  const copySchema = () => {
    navigator.clipboard.writeText(TEMPLATE_SPEC_JSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Cost estimates
  const storageGB = Math.round(userCount * 1.5);
  const r2StorageCost = Math.max(0, (storageGB - 10) * 0.015);
  const totalRenderHours = (userCount * avgRenderMins) / 60;
  const workerComputeCost = Math.round(totalRenderHours * 0.08 * 100) / 100;
  const hostingCost = 15.00;
  const databaseCost = 0.00; // Free tier
  const redisCost = 0.00; // Free tier
  const totalCost = (r2StorageCost + workerComputeCost + hostingCost + databaseCost + redisCost).toFixed(2);
  const proSubscribers = Math.round(userCount * 0.12);
  const grossRevenue = proSubscribers * 29;
  const grossProfit = Math.max(0, grossRevenue - parseFloat(totalCost)).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Top Banner: Phase Status */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg tracking-tight text-white">Video Editor &amp; Template Studio</h1>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Phase 0 Active
                </span>
              </div>
              <p className="text-xs text-slate-400">Technical Architecture &amp; Product Specification</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs text-slate-400">Blueprint Version: <span className="font-mono text-slate-200">v1.0.0</span></span>
            <div className="h-4 w-px bg-slate-800" />
            <span className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Ready for Review
            </span>
          </div>
        </div>
      </header>

      {/* Hero Notice for Beginner Founder */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 relative overflow-hidden shadow-xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium mb-3 border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5" /> Founder Architecture Brief
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Welcome to Phase 0: The Engineering Source of Truth
              </h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Before writing production code, every technical decision, database entity, and template schema is strictly defined. This prevents costly architectural rewrites and ensures the app can scale to thousands of users with 90%+ gross margins.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-center min-w-[100px]">
                <div className="text-xl font-bold text-emerald-400">22</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Phases Planned</div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-center min-w-[100px]">
                <div className="text-xl font-bold text-indigo-400">$0</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Egress (R2)</div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-center min-w-[100px]">
                <div className="text-xl font-bold text-amber-400">100%</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Data Templates</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-px">
          {[
            { id: 'stack', label: 'Technology Stack', icon: Cpu },
            { id: 'template', label: 'Template Engine (Core USP)', icon: Layers },
            { id: 'flow', label: 'Data Flow & Workers', icon: Workflow },
            { id: 'roadmap', label: '22-Phase Roadmap', icon: Clock },
            { id: 'costs', label: 'Unit Economics & Margin', icon: DollarSign },
            { id: 'scope', label: 'V1 Scope Boundaries', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-white bg-indigo-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: TECH STACK */}
        {activeTab === 'stack' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">Recommended Production Stack</h3>
                <p className="text-sm text-slate-400">
                  Every layer is selected for maximum reliability, low startup cost, and rapid development speed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TECH_STACK.map((item, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold uppercase tracking-wider text-indigo-400">{item.category}</span>
                      <span className="text-slate-500">vs {item.alternatives.join(', ')}</span>
                    </div>
                    <div className="text-base font-bold text-white mb-2">{item.selected}</div>
                    <p className="text-xs text-slate-300 leading-relaxed mb-3">{item.reason}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-800/80">
                    <span className="text-[11px] text-amber-300/90 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{item.whyForBeginner}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: TEMPLATE ENGINE */}
        {activeTab === 'template' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">The Structured Template Engine</h3>
              <p className="text-sm text-slate-400">
                Templates are never saved as flattened MP4s. They are procedural data recipes containing media slots, layout rules, typography styles, and auto-crop behaviors.
              </p>
            </div>

            {/* Visual Process */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              {[
                {
                  step: '01',
                  title: 'Template Recipe',
                  desc: 'Defines abstract slots (PRIMARY_VIDEO, LOGO_SLOT, HOOK_TITLE) with layout, crop, and font constraints.',
                },
                {
                  step: '02',
                  title: 'User Ingestion',
                  desc: 'The user uploads a new raw video (e.g. Episode 42) and picks the "Viral Podcast Short" template.',
                },
                {
                  step: '03',
                  title: 'Procedural Instantiation',
                  desc: 'The engine clones the recipe, generating fresh UUIDs and injecting the new media IDs into the slots.',
                },
                {
                  step: '04',
                  title: 'Independent Project',
                  desc: 'A completely new, editable project timeline is created. The original template remains 100% untouched.',
                },
              ].map((card, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 relative">
                  <span className="text-xs font-mono font-bold text-indigo-400">{card.step}</span>
                  <h4 className="text-sm font-semibold text-white mt-1 mb-1">{card.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* Interactive JSON Schema Viewer */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono text-slate-200">viral_podcast_short.template.json</span>
                </div>
                <button
                  onClick={copySchema}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-indigo-300/90 overflow-x-auto max-h-[420px] leading-relaxed">
                {TEMPLATE_SPEC_JSON}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: DATA FLOW & WORKERS */}
        {activeTab === 'flow' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">System Architecture &amp; Compute Boundaries</h3>
              <p className="text-sm text-slate-400">
                Heavy operations (transcoding, audio waveform calculation, and final 1080p rendering) are offloaded to background workers. The browser stays fluid at 60fps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-slate-900/80 border border-indigo-500/30">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <Film className="w-4 h-4" /> Browser (Client-Side)
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Direct multipart upload to Cloudflare R2 via presigned URLs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Instant timeline scrubbing using 720p H.264 proxy files</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>HTML5 Canvas 2D overlay compositing (text, stickers, crop box)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Local undo/redo stack in Zustand store</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-violet-500/30">
                <div className="flex items-center gap-2 text-violet-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <Database className="w-4 h-4" /> API Server (Node.js/Express)
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Tenant-guarded project &amp; timeline CRUD</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Template procedural slot resolution &amp; deep cloning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>R2 presigned upload &amp; download URL issuance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Quota limits enforcement (storage &amp; render minutes)</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <Cpu className="w-4 h-4" /> Compute Fleet (BullMQ Workers)
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>FFmpeg 720p proxy generation with faststart moov atom</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Audio waveform JSON extraction via audiowaveform</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Remotion headless Chrome frame-accurate 1080p MP4 export</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Job progress reporting (0% to 100%) and automatic retries</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ROADMAP */}
        {activeTab === 'roadmap' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">The 22-Phase Production Roadmap</h3>
                <p className="text-sm text-slate-400">
                  Each phase is completed and verified sequentially. We are currently concluding Phase 0.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {ROADMAP_PHASES.map((phase) => (
                <div
                  key={phase.phaseNumber}
                  className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    phase.status === 'active'
                      ? 'bg-indigo-950/20 border-indigo-500/50 shadow-lg shadow-indigo-950/20'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                        phase.status === 'active'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      P{phase.phaseNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">{phase.title}</h4>
                        {phase.status === 'active' && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Current Step
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{phase.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {phase.deliverables.map((item, dIdx) => (
                      <span
                        key={dIdx}
                        className="px-2.5 py-1 text-[11px] rounded-md bg-slate-800 text-slate-300 border border-slate-700/60"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: UNIT ECONOMICS & COSTS */}
        {activeTab === 'costs' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">Startup Unit Economics &amp; Cost Simulator</h3>
              <p className="text-sm text-slate-400">
                Test how Cloudflare R2's zero-egress architecture keeps gross margins above 90% as user volume scales.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive Controls */}
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
                <h4 className="text-sm font-semibold text-white">Simulation Parameters</h4>
                
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-2">
                    <span>Active Users:</span>
                    <span className="font-bold text-indigo-400">{userCount} users</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="50"
                    value={userCount}
                    onChange={(e) => setUserCount(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 bg-slate-800"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-2">
                    <span>Avg Render Mins / User:</span>
                    <span className="font-bold text-indigo-400">{avgRenderMins} minutes</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={avgRenderMins}
                    onChange={(e) => setAvgRenderMins(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 bg-slate-800"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
                  <p>• Estimated Paid Pro Users (12%): <span className="text-white font-semibold">{proSubscribers}</span></p>
                  <p>• Total Storage Required: <span className="text-white font-semibold">{storageGB} GB</span></p>
                  <p>• Total Render Hours: <span className="text-white font-semibold">{totalRenderHours.toFixed(1)} hrs</span></p>
                </div>
              </div>

              {/* Monthly Cost Breakdown */}
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <h4 className="text-sm font-semibold text-white">Monthly Infrastructure Cost</h4>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Cloudflare R2 Storage (10GB Free):</span>
                    <span className="font-mono text-white">${r2StorageCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">R2 Egress Bandwidth (Zero Egress):</span>
                    <span className="font-mono text-emerald-400 font-bold">$0.00</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Worker Render Compute ($0.08/hr):</span>
                    <span className="font-mono text-white">${workerComputeCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">API Server &amp; Container Hosting:</span>
                    <span className="font-mono text-white">${hostingCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">PostgreSQL (Free tier):</span>
                    <span className="font-mono text-white">$0.00</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Redis BullMQ (Free tier):</span>
                    <span className="font-mono text-white">$0.00</span>
                  </div>
                </div>

                <div className="pt-2 flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-200">Total Monthly Cost:</span>
                  <span className="text-amber-400 font-mono">${totalCost}</span>
                </div>
              </div>

              {/* Revenue & Margin */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 space-y-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">Monthly SaaS Margin</h4>
                  <div className="mt-4 space-y-3">
                    <div>
                      <span className="text-xs text-slate-400">Gross Monthly Revenue</span>
                      <div className="text-2xl font-bold text-white">${grossRevenue}</div>
                      <span className="text-[11px] text-slate-400">({proSubscribers} Pro @ $29/mo)</span>
                    </div>

                    <div className="pt-3 border-t border-slate-800">
                      <span className="text-xs text-slate-400">Net Estimated Profit</span>
                      <div className="text-2xl font-bold text-emerald-400">${grossProfit}</div>
                      <span className="text-[11px] text-emerald-400/90 font-medium">
                        ~{grossRevenue > 0 ? Math.round((parseFloat(grossProfit) / grossRevenue) * 100) : 0}% Gross Margin
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 leading-snug">
                  Zero egress fees with Cloudflare R2 ensure you never face unexpected spikes when users preview videos.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SCOPE BOUNDARIES */}
        {activeTab === 'scope' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">V1 MVP Scope Discipline</h3>
              <p className="text-sm text-slate-400">
                To launch a high-quality product, we prioritize the core template engine and exclude unnecessary distractions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* MUST HAVE */}
              <div className="p-5 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" /> Must Have in V1 (MVP Core)
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Structured Template Engine:</strong> Save projects as data recipes; apply new media to slots.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Multi-Track Timeline:</strong> Trimming, splitting, snapping, and track layering.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Visual Transforms:</strong> Position, scale, rotation, opacity, and 9:16 / 16:9 canvas aspect ratios.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Text &amp; Subtitle Styler:</strong> Animated text presets and word pop captions.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Cloud Rendering:</strong> Remotion/FFmpeg background worker rendering 1080p MP4.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong>Stripe Billing:</strong> Free vs. Pro tier with monthly render minute tracking.</span>
                  </li>
                </ul>
              </div>

              {/* EXCLUDED IN V1 */}
              <div className="p-5 rounded-xl bg-slate-900 border border-rose-500/30 space-y-4">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4" /> Intentionally Excluded From V1
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>AI Video Generation / Generative Avatars:</strong> High external API costs, distracts from core editor.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>Real-time Multiplayer Collaboration:</strong> Unnecessary synchronization complexity for V1.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>4K Video Rendering:</strong> High server CPU consumption; 1080p is standard for shorts.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>Mobile Native Apps:</strong> Desktop/laptop browser is the primary environment for serious editing.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>Advanced Color Grading / LUT Shaders:</strong> Complex shader pipelines not needed for podcast shorts.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">✕</span>
                    <span><strong>Large Stock Media Marketplace:</strong> Avoid expensive third-party licensing APIs.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Callout */}
      <footer className="border-t border-slate-800 bg-slate-950 py-6 text-center text-xs text-slate-500">
        Phase 0 Architectural Blueprint complete. Ready to proceed to Phase 1 (Foundation &amp; Dev Setup).
      </footer>
    </div>
  );
};
