export interface TechChoice {
  category: string;
  selected: string;
  alternatives: string[];
  reason: string;
  whyForBeginner: string;
}

export interface RoadmapPhase {
  phaseNumber: number;
  title: string;
  description: string;
  deliverables: string[];
  status: 'active' | 'pending' | 'completed';
}

export const TECH_STACK: TechChoice[] = [
  {
    category: "Frontend Framework",
    selected: "React 19 + Vite + TypeScript",
    alternatives: ["Next.js (SSR)", "Remix", "Svelte"],
    reason: "A browser video editor requires microsecond canvas redraws and zero-latency timeline scrubbing. Next.js Server Components add heavy friction for stateful Web Audio and Canvas contexts.",
    whyForBeginner: "React SPA is straightforward to reason about: everything runs in the browser, no confusing server-action or hydration boundary bugs."
  },
  {
    category: "UI & Styling",
    selected: "Tailwind CSS + Radix UI Primitives",
    alternatives: ["MUI", "Chakra UI", "CSS Modules"],
    reason: "Zero runtime CSS overhead. Essential to maintain a consistent 60fps frame rate during timeline scrubbing and live scaling.",
    whyForBeginner: "Utility classes make adjusting padding, colors, and layout fast without writing hundreds of custom CSS files."
  },
  {
    category: "Timeline State Engine",
    selected: "Zustand with Immer Middleware",
    alternatives: ["Redux Toolkit", "Jotai", "React Context"],
    reason: "Allows micro-subscriptions. Moving a clip on track 3 re-renders only track 3, preventing lag across the canvas, inspector, and audio mixer.",
    whyForBeginner: "Minimal boilerplate compared to Redux, with built-in immutable updates via Immer."
  },
  {
    category: "Canvas Compositor",
    selected: "HTML5 Canvas 2D + Web Audio API",
    alternatives: ["Pixi.js", "Three.js", "Pure DOM <video>"],
    reason: "Lightweight and fully controllable. Allows custom crop boxes, text layers, and transition blending without heavy 3D engine overhead.",
    whyForBeginner: "Standard browser API supported across all modern browsers without complex shader debugging."
  },
  {
    category: "Backend API Server",
    selected: "Node.js (Express) with TypeScript",
    alternatives: ["Fastify", "NestJS", "Go / Python"],
    reason: "Runs natively in our AI Studio environment on Port 3000, unifies TypeScript types across client and server, and handles multipart upload negotiation.",
    whyForBeginner: "Express is the most documented and battle-tested Node framework in existence with abundant tutorials and guides."
  },
  {
    category: "Database & ORM",
    selected: "PostgreSQL + Drizzle ORM",
    alternatives: ["Prisma", "TypeORM", "MongoDB"],
    reason: "PostgreSQL provides relational integrity for multi-tenant accounts, projects, and template slot hierarchies. Drizzle generates zero runtime bloat and pure type-safety.",
    whyForBeginner: "Drizzle writes clean, readable SQL queries without mysterious hidden Prisma engine binaries."
  },
  {
    category: "Object Storage",
    selected: "Cloudflare R2 (S3 API)",
    alternatives: ["AWS S3", "Google Cloud Storage", "Supabase Storage"],
    reason: "Zero egress fees. AWS S3 charges $0.09/GB for downloads. Video editing involves transferring gigabytes of footage; S3 egress would destroy SaaS profit margins.",
    whyForBeginner: "Cloudflare R2 behaves identically to S3 using the AWS SDK, but your monthly bill won't surprise you with bandwidth charges."
  },
  {
    category: "Video Transcoding",
    selected: "FFmpeg (Ingestion & Waveform Pipeline)",
    alternatives: ["GStreamer", "Cloud Transcoder APIs"],
    reason: "Industry standard for probing media headers, generating 720p H.264 fast-start proxies, and extracting audio waveforms.",
    whyForBeginner: "Reliable and runs anywhere via containerized worker scripts."
  },
  {
    category: "Final Video Export",
    selected: "Remotion + Headless Chromium Worker",
    alternatives: ["Pure FFmpeg Filtergraphs", "Shotstack API"],
    reason: "Remotion renders React components directly to MP4 frame-by-frame. What the user previews in React is 100% pixel-for-pixel identical to the exported video.",
    whyForBeginner: "Instead of writing complex mathematical FFmpeg filter string scripts, you write clean React code for titles, transitions, and overlays."
  },
  {
    category: "Job Queue & Task Broker",
    selected: "Redis + BullMQ",
    alternatives: ["RabbitMQ", "AWS SQS", "Temporal"],
    reason: "Decouples long video renders from HTTP requests. Provides job retries, progress percentages (0-100%), and worker pool scaling.",
    whyForBeginner: "BullMQ runs directly in TypeScript with clear lifecycle events: queued, progress, completed, failed."
  },
  {
    category: "Authentication",
    selected: "Firebase Auth / Supabase Auth",
    alternatives: ["Clerk", "Auth0", "Custom JWT"],
    reason: "Built-in tenant isolation, secure JWT tokens, Google social login, and generous free tier (50,000 monthly active users).",
    whyForBeginner: "Handles password hashing, token refreshes, and reset emails without custom cryptography code."
  },
  {
    category: "Billing & Subscriptions",
    selected: "Stripe Billing & Customer Portal",
    alternatives: ["Paddle", "Lemon Squeezy"],
    reason: "Industry benchmark for recurring SaaS subscriptions, automated invoice generation, and secure webhook signature verification.",
    whyForBeginner: "Pre-built Stripe Checkout and Customer Portal mean you don't have to build custom credit card forms."
  }
];

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    phaseNumber: 0,
    title: "Architecture & Blueprint Analysis",
    description: "Define technical specifications, data models, template engine rules, and cost models. Zero production code written until plan is approved.",
    deliverables: ["22-Point Technical Blueprint", "Data Models (JSON & SQL)", "Risk Analysis & Mitigation Plan"],
    status: "active"
  },
  {
    phaseNumber: 1,
    title: "Development Setup & Shared Contracts",
    description: "Configure Express + Vite dev server on Port 3000, folder structure, and shared TypeScript interfaces.",
    deliverables: ["server.ts entry point", "timeline.ts, template.ts, media.ts types", "Shared constants"],
    status: "pending"
  },
  {
    phaseNumber: 2,
    title: "Application Shell & Layout System",
    description: "Responsive editor layout: Canvas stage viewport, timeline dock, clip inspector, and media bin.",
    deliverables: ["Editor Shell Layout", "Dock Resizing", "Theme & Icon integration"],
    status: "pending"
  },
  {
    phaseNumber: 3,
    title: "Authentication & Tenant Guard",
    description: "User signup, login, session persistence, and tenant isolation middleware.",
    deliverables: ["Auth context", "Protected routes", "Tenant scoping middleware"],
    status: "pending"
  },
  {
    phaseNumber: 4,
    title: "Database Schema & Persistence",
    description: "PostgreSQL setup with Drizzle ORM for projects, timelines, tracks, clips, and templates.",
    deliverables: ["Drizzle schema", "Migration files", "Repository queries"],
    status: "pending"
  },
  {
    phaseNumber: 5,
    title: "Project Management Dashboard",
    description: "Dashboard to create, duplicate, rename, and organize projects with aspect ratio selection.",
    deliverables: ["Project Grid View", "Create Project Modal (9:16, 16:9, 1:1)", "Delete & Duplicate"],
    status: "pending"
  },
  {
    phaseNumber: 6,
    title: "Direct Media Upload Pipeline",
    description: "Direct-to-storage presigned upload with client-side drag-and-drop and progress tracking.",
    deliverables: ["R2 Presigned URL API", "Media Bin Component", "MIME & Size Validator"],
    status: "pending"
  },
  {
    phaseNumber: 7,
    title: "Editor Canvas & Playhead Engine",
    description: "HTML5 Canvas viewport with real-time transform gizmo (drag, scale, rotate, crop) and 60fps clock.",
    deliverables: ["Canvas Stage", "Transform Handles", "Virtual Playhead Engine"],
    status: "pending"
  },
  {
    phaseNumber: 8,
    title: "Multi-Track Interactive Timeline",
    description: "Track rows for video, audio, text, and captions with trimming, splitting, and snapping.",
    deliverables: ["Timeline Ruler & Scrubbing", "Clip Trim Handles", "Clip Split (Razor Tool)"],
    status: "pending"
  },
  {
    phaseNumber: 9,
    title: "Template Engine: Procedural Core",
    description: "Abstractor engine that converts a concrete project into a reusable template recipe with abstract slots.",
    deliverables: ["Project-to-Template Generator", "Slot Rule Evaluator", "Template JSON Serializer"],
    status: "pending"
  },
  {
    phaseNumber: 10,
    title: "Built-in System Templates",
    description: "3 production-quality templates: 'Viral Podcast Short', 'Gaming Highlight', and 'Minimal Vlog'.",
    deliverables: ["Podcast 9:16 Preset", "Gaming 9:16 Preset", "Vlog 16:9 Preset"],
    status: "pending"
  },
  {
    phaseNumber: 11,
    title: "User Custom Template Studio",
    description: "Allow users to turn any project into a private template with named placeholder slots.",
    deliverables: ["Save as Template UI", "Slot Tagging Dialog", "User Template Browser"],
    status: "pending"
  },
  {
    phaseNumber: 12,
    title: "Template Instantiation & Application",
    description: "Apply Template workflow: Ingest new video into slots and generate an independent, editable project.",
    deliverables: ["Slot Ingestion Modal", "Deep Clone Engine", "Independence Verifier"],
    status: "pending"
  },
  {
    phaseNumber: 13,
    title: "FFmpeg Ingestion & Waveforms",
    description: "Server/worker pipeline to generate fast 720p proxies and extract audio waveforms.",
    deliverables: ["FFmpeg Transcode Worker", "Waveform JSON Generator", "Thumbnail Extractor"],
    status: "pending"
  },
  {
    phaseNumber: 14,
    title: "Remotion Cloud Rendering Engine",
    description: "Remotion composition that mirrors the React timeline for frame-accurate 1080p MP4 rendering.",
    deliverables: ["Remotion Root Composition", "Audio Track Mixer", "Export Pipeline"],
    status: "pending"
  },
  {
    phaseNumber: 15,
    title: "Background Workers & BullMQ",
    description: "Redis job queue with concurrency limits, retries, and live progress percentage reporting.",
    deliverables: ["Render Queue Manager", "Progress SSE Endpoint", "Retry & Error Recovery"],
    status: "pending"
  },
  {
    phaseNumber: 16,
    title: "Export Manager & Download Delivery",
    description: "Resolution selection (720p/1080p), export queue status dialog, and signed download delivery.",
    deliverables: ["Export Dialog", "Live Render Progress Card", "Signed Download Links"],
    status: "pending"
  },
  {
    phaseNumber: 17,
    title: "Stripe Billing & Quota Limits",
    description: "Free vs. Pro subscriptions with automated render-minute metering and storage enforcement.",
    deliverables: ["Stripe Checkout & Portal", "Webhook Handler", "Quota Guard Middleware"],
    status: "pending"
  },
  {
    phaseNumber: 18,
    title: "Security Hardening & Audits",
    description: "Cross-tenant access audits, presigned URL TTL checks, and upload sanitization.",
    deliverables: ["Security Audit Tests", "MIME Magic Byte Verification", "Rate Limiter"],
    status: "pending"
  },
  {
    phaseNumber: 19,
    title: "Comprehensive Test Suite",
    description: "Unit tests for timeline math, integration tests for API endpoints, and E2E editor test.",
    deliverables: ["Vitest Suite", "API Route Tests", "Playwright E2E Flow"],
    status: "pending"
  },
  {
    phaseNumber: 20,
    title: "Performance Optimization",
    description: "Timeline track virtualization for 100+ clips and WebGL caching for smooth scrubbing.",
    deliverables: ["Virtualized Track List", "AudioContext Pool", "Memory Leak Prevention"],
    status: "pending"
  },
  {
    phaseNumber: 21,
    title: "Production Deployment Setup",
    description: "Dockerfiles for worker containers, Cloudflare R2 CORS rules, and CI/CD pipelines.",
    deliverables: ["Production Dockerfile", "R2 CORS Config", "Deployment Checklist"],
    status: "pending"
  },
  {
    phaseNumber: 22,
    title: "Final QA & Product Handover",
    description: "End-to-end verification of the user journey from signup to template creation to export.",
    deliverables: ["QA Verification Report", "Founder Maintenance Guide", "Release Candidate"],
    status: "pending"
  }
];

export const TEMPLATE_SPEC_JSON = `{
  "$schema": "https://veedflow.app/schemas/template-v1.json",
  "templateId": "tmpl_viral_podcast_short",
  "title": "Viral Podcast Short (Subtitles + Face Zoom)",
  "category": "podcast",
  "aspectRatio": "9:16",
  "canvas": { "width": 1080, "height": 1920 },
  "durationStrategy": "match_primary_video",
  
  "slots": [
    {
      "slotKey": "PRIMARY_VIDEO_SLOT",
      "label": "Speaker Video Clip",
      "slotType": "video",
      "required": true,
      "description": "Upload horizontal or vertical footage of the speaker",
      "rules": {
        "autoCrop": "center_9_16",
        "scale": 1.2,
        "position": { "x": 0, "y": 0 }
      }
    },
    {
      "slotKey": "LOGO_SLOT",
      "label": "Corner Brand Logo",
      "slotType": "image",
      "required": false,
      "rules": {
        "position": { "x": 420, "y": -850 },
        "scale": 0.4,
        "opacity": 0.8
      }
    },
    {
      "slotKey": "EPISODE_TITLE_SLOT",
      "label": "Top Headline / Hook",
      "slotType": "text",
      "required": true,
      "defaultText": "HOW TO SCALE IN 2026",
      "rules": {
        "fontFamily": "Montserrat",
        "fontSize": 56,
        "fontWeight": 900,
        "color": "#FFDD00",
        "position": { "x": 0, "y": -700 }
      }
    },
    {
      "slotKey": "BGM_AUDIO_SLOT",
      "label": "Background Music Bed",
      "slotType": "audio",
      "required": false,
      "rules": {
        "volume": 0.15,
        "loopToMatchVideo": true,
        "fadeOutMs": 2000
      }
    }
  ],

  "trackRecipes": [
    {
      "targetSlotKey": "PRIMARY_VIDEO_SLOT",
      "trackType": "video",
      "trackOrder": 0,
      "applyRules": {
        "duration": "$PRIMARY_VIDEO_DURATION",
        "transitions": {
          "in": { "type": "fade", "durationMs": 300 }
        }
      }
    },
    {
      "trackType": "caption",
      "trackOrder": 1,
      "sourceAudioFromSlot": "PRIMARY_VIDEO_SLOT",
      "style": {
        "preset": "karaoke_pop",
        "wordsPerLine": 3,
        "fontFamily": "Inter",
        "color": "#FFFFFF",
        "highlightColor": "#00FF88",
        "yPosition": 450
      }
    },
    {
      "targetSlotKey": "LOGO_SLOT",
      "trackType": "overlay",
      "trackOrder": 2,
      "applyRules": {
        "startMs": 0,
        "endMs": "$PRIMARY_VIDEO_DURATION"
      }
    },
    {
      "targetSlotKey": "EPISODE_TITLE_SLOT",
      "trackType": "text",
      "trackOrder": 3,
      "applyRules": {
        "startMs": 0,
        "endMs": 5000,
        "transitionOut": { "type": "slide_up", "durationMs": 400 }
      }
    }
  ]
}`;
