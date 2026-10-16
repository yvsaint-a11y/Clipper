import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from './ui';
import { Database, ShieldCheck, Layers, GitBranch, RefreshCw, CheckCircle2, AlertCircle, Key, FileCode2, Cpu, Lock } from 'lucide-react';

interface DbStatusResponse {
  database: {
    isConfigured: boolean;
    isConnected: boolean;
    error: string | null;
    latencyMs: number | null;
  };
  registeredSchemas: string[];
  engine: string;
  authProvider: string;
  timestamp: string;
}

interface TableDefinition {
  name: string;
  schemaFile: string;
  category: 'Auth & Billing' | 'Projects & Timeline' | 'Media & Assets' | 'Templates' | 'Rendering';
  description: string;
  ownershipEnforcement: string;
  relationalColumns: string[];
  jsonbColumns: string[];
  foreignKeys: string[];
  uniqueConstraints: string[];
}

const SCHEMA_TABLES: TableDefinition[] = [
  {
    name: 'users',
    schemaFile: 'server/db/schema/users.ts',
    category: 'Auth & Billing',
    description: 'Profiles table directly referencing Supabase Auth auth.users(id) UUID.',
    ownershipEnforcement: 'Primary root identity entity. Never accepts client-provided IDs.',
    relationalColumns: ['id (uuid, PK)', 'email (varchar)', 'display_name', 'avatar_url', 'subscription_tier', 'stripe_customer_id', 'stripe_subscription_id', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['References Supabase Auth auth.users(id) via UUID primary key'],
    uniqueConstraints: ['UNIQUE (stripe_customer_id)'],
  },
  {
    name: 'projects',
    schemaFile: 'server/db/schema/projects.ts',
    category: 'Projects & Timeline',
    description: 'Primary project metadata, resolution (max 1080p), aspect ratio, framerate.',
    ownershipEnforcement: 'Enforced via user_id FK -> users(id) ON DELETE CASCADE.',
    relationalColumns: ['id (uuid, PK)', 'user_id (uuid)', 'name (varchar)', 'description', 'aspect_ratio', 'resolution (max 1080p)', 'fps', 'duration_ms', 'current_version_number', 'thumbnail_url', 'is_archived', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['user_id -> users(id) ON DELETE CASCADE'],
    uniqueConstraints: [],
  },
  {
    name: 'project_versions',
    schemaFile: 'server/db/schema/projects.ts',
    category: 'Projects & Timeline',
    description: 'Immutable historical snapshots of canonical project state for rollback & reproducible rendering.',
    ownershipEnforcement: 'Enforced via user_id FK and project_id FK.',
    relationalColumns: ['id (uuid, PK)', 'project_id (uuid)', 'user_id (uuid)', 'version_number (int)', 'label', 'checksum (SHA-256)', 'created_at'],
    jsonbColumns: ['snapshot (Complete frozen timeline, tracks, clips JSONB)'],
    foreignKeys: ['project_id -> projects(id) ON DELETE CASCADE', 'user_id -> users(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (project_id, version_number)'],
  },
  {
    name: 'media_assets',
    schemaFile: 'server/db/schema/media.ts',
    category: 'Media & Assets',
    description: 'Stores metadata for video, audio, and image assets stored in Cloudflare R2.',
    ownershipEnforcement: 'Enforced via user_id FK -> users(id) ON DELETE CASCADE.',
    relationalColumns: ['id (uuid, PK)', 'user_id (uuid)', 'storage_key (text)', 'original_filename', 'mime_type', 'file_size_bytes (bigint)', 'duration_ms', 'width', 'height', 'fps', 'has_audio', 'ingestion_status', 'waveform_url', 'thumbnail_url', 'created_at', 'updated_at'],
    jsonbColumns: ['metadata (Audio sample rate, channel count, video color space, codec details)'],
    foreignKeys: ['user_id -> users(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (storage_key)'],
  },
  {
    name: 'timelines',
    schemaFile: 'server/db/schema/timelines.ts',
    category: 'Projects & Timeline',
    description: 'Relational root timeline for active project editing.',
    ownershipEnforcement: 'Enforced via project_id FK -> projects(id) ON DELETE CASCADE.',
    relationalColumns: ['id (uuid, PK)', 'project_id (uuid, UNIQUE)', 'duration_ms', 'fps', 'timebase', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['project_id -> projects(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (project_id)'],
  },
  {
    name: 'tracks',
    schemaFile: 'server/db/schema/timelines.ts',
    category: 'Projects & Timeline',
    description: 'Vertical lanes/layers for video, audio, text, and caption clips.',
    ownershipEnforcement: 'Cascaded via timeline_id FK -> timelines(id).',
    relationalColumns: ['id (uuid, PK)', 'timeline_id (uuid)', 'index (int, Z-ordering)', 'type (video/audio/text/caption)', 'name', 'is_locked', 'is_muted', 'volume', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['timeline_id -> timelines(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (timeline_id, index)'],
  },
  {
    name: 'clips',
    schemaFile: 'server/db/schema/timelines.ts',
    category: 'Projects & Timeline',
    description: 'Individual media segments placed on tracks. Hybrid relational + JSONB design.',
    ownershipEnforcement: 'Cascaded via track_id FK -> tracks(id).',
    relationalColumns: ['id (uuid, PK)', 'track_id (uuid)', 'media_asset_id (uuid, optional)', 'type', 'name', 'start_ms', 'end_ms', 'trim_start_ms', 'trim_end_ms', 'speed', 'slot_binding', 'created_at', 'updated_at'],
    jsonbColumns: [
      'transform (position {x,y}, scale {x,y}, rotation, opacity)',
      'crop ({x, y, width, height, unit})',
      'audio_properties ({volume, fadeInMs, fadeOutMs, muted, pan})',
      'text_properties ({content, fontFamily, fontSize, color, fontWeight, alignment, background})',
      'caption_properties ({words: [{text, startMs, endMs}], style})',
      'transitions ({in, out})',
      'effects (video filters & adjustments array)',
      'animations (keyframe tracks array)',
    ],
    foreignKeys: ['track_id -> tracks(id) ON DELETE CASCADE', 'media_asset_id -> media_assets(id) ON DELETE SET NULL'],
    uniqueConstraints: [],
  },
  {
    name: 'templates',
    schemaFile: 'server/db/schema/templates.ts',
    category: 'Templates',
    description: 'Catalog header for reusable video recipe templates.',
    ownershipEnforcement: 'Enforced via user_id FK -> users(id) ON DELETE SET NULL (null for system curated).',
    relationalColumns: ['id (uuid, PK)', 'user_id (uuid, optional)', 'name', 'description', 'category', 'aspect_ratio', 'is_public', 'is_system', 'thumbnail_url', 'preview_video_url', 'current_version_number', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['user_id -> users(id) ON DELETE SET NULL'],
    uniqueConstraints: [],
  },
  {
    name: 'template_versions',
    schemaFile: 'server/db/schema/templates.ts',
    category: 'Templates',
    description: 'IMMUTABLE versioned recipes. Projects apply specific immutable versions, never mutating the original.',
    ownershipEnforcement: 'Cascaded via template_id FK -> templates(id).',
    relationalColumns: ['id (uuid, PK)', 'template_id (uuid)', 'version_number (int)', 'changelog', 'checksum (SHA-256)', 'is_published', 'created_at'],
    jsonbColumns: ['timeline_snapshot (Immutable canonical tracks, clips, slot placeholders, duration, resolution)'],
    foreignKeys: ['template_id -> templates(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (template_id, version_number)'],
  },
  {
    name: 'template_slots',
    schemaFile: 'server/db/schema/templates.ts',
    category: 'Templates',
    description: 'Declared replacement inputs (text, image, video, audio) strictly bound to immutable template versions.',
    ownershipEnforcement: 'Cascaded via template_version_id FK -> template_versions(id).',
    relationalColumns: ['id (uuid, PK)', 'template_version_id (uuid)', 'slot_key (varchar)', 'label', 'type', 'description', 'target_clip_id', 'display_order', 'created_at'],
    jsonbColumns: ['default_value (default slot content)', 'constraints (maxCharacters, allowedAspectRatios, minDurationMs, maxDurationMs)'],
    foreignKeys: ['template_version_id -> template_versions(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (template_version_id, slot_key)'],
  },
  {
    name: 'render_jobs',
    schemaFile: 'server/db/schema/renderJobs.ts',
    category: 'Rendering',
    description: 'Render job queue and artifacts. Enforces idempotency via SHA-256 hash of canonical render spec.',
    ownershipEnforcement: 'Enforced via user_id FK -> users(id) ON DELETE CASCADE.',
    relationalColumns: ['id (uuid, PK)', 'user_id (uuid)', 'project_id (uuid)', 'project_version_id (uuid, optional)', 'idempotency_key (SHA-256)', 'status', 'resolution (max 1080p)', 'fps', 'format', 'watermark', 'progress_percentage', 'current_step', 'output_storage_key', 'output_url', 'output_file_size_bytes', 'render_duration_seconds', 'error_message', 'started_at', 'completed_at', 'created_at', 'updated_at'],
    jsonbColumns: ['render_spec (Frozen canonical render specification passed to FFmpeg/Remotion)'],
    foreignKeys: ['user_id -> users(id) ON DELETE CASCADE', 'project_id -> projects(id) ON DELETE CASCADE', 'project_version_id -> project_versions(id) ON DELETE SET NULL'],
    uniqueConstraints: ['UNIQUE (idempotency_key)'],
  },
  {
    name: 'subscriptions',
    schemaFile: 'server/db/schema/subscriptions.ts',
    category: 'Auth & Billing',
    description: 'Stripe customer and subscription state tracking Free vs Pro entitlements and export quotas.',
    ownershipEnforcement: 'Enforced via user_id FK -> users(id) ON DELETE CASCADE.',
    relationalColumns: ['id (uuid, PK)', 'user_id (uuid, UNIQUE)', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id', 'status', 'tier (free/pro)', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'exports_used_this_month', 'created_at', 'updated_at'],
    jsonbColumns: [],
    foreignKeys: ['user_id -> users(id) ON DELETE CASCADE'],
    uniqueConstraints: ['UNIQUE (user_id)', 'UNIQUE (stripe_customer_id)', 'UNIQUE (stripe_subscription_id)'],
  },
];

export const DatabaseExplorer: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<DbStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableDefinition>(SCHEMA_TABLES[0]);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const fetchDbStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const categories = ['all', 'Auth & Billing', 'Projects & Timeline', 'Media & Assets', 'Templates', 'Rendering'];

  const filteredTables = filterCategory === 'all'
    ? SCHEMA_TABLES
    : SCHEMA_TABLES.filter(t => t.category === filterCategory);

  return (
    <div className="space-y-6">
      {/* Database Connection & Status Header */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Database className="w-5 h-5 text-indigo-400" />
              PostgreSQL + Drizzle Persistence Engine
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 mt-1">
              Production relational data store designed for Supabase Auth, zero-credential leakage, and zero-egress R2 assets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDbStatus}
            disabled={isLoading}
            className="text-xs gap-1.5 border-zinc-700 text-zinc-300 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Check DB Connection</span>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-lg bg-zinc-950/70 border border-zinc-800">
            <div>
              <span className="text-[11px] text-zinc-500 block uppercase font-mono">Connection Status</span>
              {dbStatus?.database.isConnected ? (
                <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" /> Connected ({dbStatus.database.latencyMs}ms)
                </span>
              ) : (
                <span className="text-sm font-semibold text-amber-400 flex items-center gap-1.5 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                  {dbStatus?.database.isConfigured ? 'Connection Error' : 'Ready (Pending DATABASE_URL)'}
                </span>
              )}
            </div>

            <div>
              <span className="text-[11px] text-zinc-500 block uppercase font-mono">ORM Engine</span>
              <span className="text-xs font-medium text-zinc-200 block mt-1 font-mono">
                {dbStatus?.engine || 'PostgreSQL + Drizzle ORM'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-zinc-500 block uppercase font-mono">Authentication Authority</span>
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 mt-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Supabase Auth (UUID Verified)
              </span>
            </div>

            <div>
              <span className="text-[11px] text-zinc-500 block uppercase font-mono">Registered Tables</span>
              <span className="text-xs font-medium text-indigo-300 block mt-1 font-mono">
                {SCHEMA_TABLES.length} Canonical Tables
              </span>
            </div>
          </div>

          {dbStatus?.database.error && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold block">Database Connection Notice:</span>
                <span className="text-zinc-400 font-mono text-[11px]">{dbStatus.database.error}</span>
                <p className="text-[11px] text-zinc-400 mt-1">
                  The application is fully initialized with lazy connection management. When you configure the <code className="text-zinc-200 font-mono bg-zinc-800 px-1 py-0.5 rounded">DATABASE_URL</code> secret in the platform Settings menu, Drizzle will pool and connect seamlessly.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Architectural Pillars Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              1. Enforced User Ownership
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
            <p>
              Every user-authored table (<code className="text-zinc-300">projects</code>, <code className="text-zinc-300">media_assets</code>, <code className="text-zinc-300">render_jobs</code>, <code className="text-zinc-300">subscriptions</code>) has a strictly foreign-keyed <code className="text-zinc-300 font-mono">user_id</code> column matching the Supabase Auth UUID.
            </p>
            <p className="text-[11px] text-emerald-400/90 font-mono">
              Never trusts client-supplied user IDs; derived exclusively from verified JWT tokens.
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              2. Hybrid Relational + JSONB
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
            <p>
              Queryable, filterable properties (startMs, endMs, speed, status, resolution) live in relational columns with btree indexes.
            </p>
            <p className="text-[11px] text-indigo-400/90 font-mono">
              Extensible, nested visual properties (transforms, crops, filters, keyframes) live in structured JSONB.
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-purple-400" />
              3. Immutable Template Versioning
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
            <p>
              Template versions (<code className="text-zinc-300">template_versions</code>) are completely immutable once created. Applying a template binds directly to the specific version ID.
            </p>
            <p className="text-[11px] text-purple-400/90 font-mono">
              Editing templates never alters existing projects; deterministic rendering guaranteed.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Schema Browser & Table Inspector */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-indigo-400" />
                Drizzle Schema Tables (12 Canonical Entities)
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Click any table to inspect relational columns, JSONB attributes, indexes, and ownership constraints.
              </CardDescription>
            </div>
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filterCategory === cat
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cat === 'all' ? 'All Tables' : cat}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Table List */}
            <div className="lg:col-span-4 space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredTables.map((tbl) => (
                <button
                  key={tbl.name}
                  onClick={() => setSelectedTable(tbl)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedTable.name === tbl.name
                      ? 'bg-zinc-800/90 border-indigo-500/60 shadow-xs'
                      : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-indigo-400" />
                      {tbl.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                      {tbl.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">{tbl.description}</p>
                </button>
              ))}
            </div>

            {/* Selected Table Inspector */}
            <div className="lg:col-span-8 p-5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-white">{selectedTable.name}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedTable.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedTable.description}</p>
                </div>
                <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                  {selectedTable.schemaFile}
                </span>
              </div>

              {/* Ownership & Foreign Keys */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Ownership & Cascading Rules
                </span>
                <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300">
                  <span className="text-emerald-400 font-mono font-medium block">
                    {selectedTable.ownershipEnforcement}
                  </span>
                  {selectedTable.foreignKeys.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-mono block">Foreign Key Constraints:</span>
                      {selectedTable.foreignKeys.map((fk, idx) => (
                        <span key={idx} className="block text-[11px] font-mono text-zinc-400">
                          ↳ {fk}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedTable.uniqueConstraints.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-mono block">Uniqueness Constraints:</span>
                      {selectedTable.uniqueConstraints.map((uc, idx) => (
                        <span key={idx} className="block text-[11px] font-mono text-indigo-300">
                          ✓ {uc}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Relational Columns vs JSONB */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Relational Columns */}
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block flex items-center gap-1.5 mb-2">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    Relational Columns ({selectedTable.relationalColumns.length})
                  </span>
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1 max-h-56 overflow-y-auto">
                    {selectedTable.relationalColumns.map((col, idx) => (
                      <div key={idx} className="text-[11px] font-mono text-zinc-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/80 shrink-0" />
                        <span>{col}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* JSONB Columns */}
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block flex items-center gap-1.5 mb-2">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    Structured JSONB ({selectedTable.jsonbColumns.length})
                  </span>
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5 max-h-56 overflow-y-auto">
                    {selectedTable.jsonbColumns.length > 0 ? (
                      selectedTable.jsonbColumns.map((col, idx) => (
                        <div key={idx} className="text-[11px] font-mono text-purple-300 leading-snug">
                          <span className="font-semibold text-purple-200">▪ </span>
                          <span>{col}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-500 italic block py-4 text-center">
                        Strictly normalized (no JSONB columns)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Drizzle CLI Workflow Reference */}
              <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Migration CLI command:</span>
                  <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono text-[11px]">
                    npm run db:push
                  </code>
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  drizzle/0000_silent_marrow.sql
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
