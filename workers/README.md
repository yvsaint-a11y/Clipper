# Workers Directory (Background Compute Pipeline)

This directory houses the background worker processes for media ingestion, transcoding, and rendering:

## Planned Modules
1. `ffmpeg/` (Ingestion & Media Preparation)
   - Media probing and format validation
   - Proxy generation (360p / 720p H.264 preview proxies)
   - Video thumbnail extraction
   - Audio waveform extraction (normalized peak arrays)
   - Audio normalization (EBU R128)

2. `remotion/` (Deterministic Composition & Rendering)
   - Consumes canonical `RenderSpec`
   - Evaluates multi-track compositions (video, audio, text, captions, animations, transitions)
   - Renders 720p and 1080p final MP4 files
   - Uploads exports directly to Cloudflare R2

3. `queue/` (BullMQ & Redis)
   - Queue definitions: `media-ingestion-queue` and `video-render-queue`
   - Concurrency control and rate limiting
   - Job progress reporting and heartbeat monitoring
