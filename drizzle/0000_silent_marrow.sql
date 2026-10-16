CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"avatar_url" text,
	"subscription_tier" varchar(32) DEFAULT 'free' NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"label" varchar(128),
	"snapshot" jsonb NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"aspect_ratio" varchar(16) DEFAULT '16:9' NOT NULL,
	"resolution" varchar(16) DEFAULT '1080p' NOT NULL,
	"fps" integer DEFAULT 30 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"current_version_number" integer DEFAULT 1 NOT NULL,
	"thumbnail_url" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"media_asset_id" uuid,
	"type" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"trim_start_ms" integer DEFAULT 0 NOT NULL,
	"trim_end_ms" integer DEFAULT 0 NOT NULL,
	"speed" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"transform" jsonb DEFAULT '{"position":{"x":0,"y":0},"scale":{"x":1,"y":1},"rotation":0,"opacity":1}'::jsonb NOT NULL,
	"crop" jsonb,
	"audio_properties" jsonb,
	"text_properties" jsonb,
	"caption_properties" jsonb,
	"transitions" jsonb,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"animations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slot_binding" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"fps" integer DEFAULT 30 NOT NULL,
	"timebase" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timelines_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timeline_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"volume" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"fps" numeric(6, 2),
	"has_audio" boolean DEFAULT false NOT NULL,
	"ingestion_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"waveform_url" text,
	"thumbnail_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "template_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"slot_key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"type" varchar(32) NOT NULL,
	"description" text,
	"target_clip_id" varchar(64) NOT NULL,
	"default_value" jsonb,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"timeline_snapshot" jsonb NOT NULL,
	"changelog" text,
	"checksum" varchar(64) NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64) DEFAULT 'general' NOT NULL,
	"aspect_ratio" varchar(16) DEFAULT '16:9' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"thumbnail_url" text,
	"preview_video_url" text,
	"current_version_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version_id" uuid,
	"idempotency_key" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"resolution" varchar(16) DEFAULT '1080p' NOT NULL,
	"fps" integer DEFAULT 30 NOT NULL,
	"format" varchar(16) DEFAULT 'mp4' NOT NULL,
	"watermark" boolean DEFAULT false NOT NULL,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"current_step" varchar(64) DEFAULT 'queued',
	"render_spec" jsonb NOT NULL,
	"output_storage_key" text,
	"output_url" text,
	"output_file_size_bytes" bigint,
	"render_duration_seconds" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"tier" varchar(32) DEFAULT 'free' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"exports_used_this_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timelines" ADD CONSTRAINT "timelines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_timeline_id_timelines_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_slots" ADD CONSTRAINT "template_slots_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_version_id_project_versions_id_fk" FOREIGN KEY ("project_version_id") REFERENCES "public"."project_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_versions_project_version_unique_idx" ON "project_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "project_versions_project_id_idx" ON "project_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_versions_user_id_idx" ON "project_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "clips_track_id_idx" ON "clips" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "clips_media_asset_id_idx" ON "clips" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "clips_temporal_range_idx" ON "clips" USING btree ("track_id","start_ms","end_ms");--> statement-breakpoint
CREATE INDEX "timelines_project_id_idx" ON "timelines" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_timeline_index_unique_idx" ON "tracks" USING btree ("timeline_id","index");--> statement-breakpoint
CREATE INDEX "tracks_timeline_id_idx" ON "tracks" USING btree ("timeline_id");--> statement-breakpoint
CREATE INDEX "media_assets_user_id_idx" ON "media_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_assets_status_idx" ON "media_assets" USING btree ("ingestion_status");--> statement-breakpoint
CREATE INDEX "media_assets_mime_type_idx" ON "media_assets" USING btree ("mime_type");--> statement-breakpoint
CREATE UNIQUE INDEX "template_slots_version_key_unique_idx" ON "template_slots" USING btree ("template_version_id","slot_key");--> statement-breakpoint
CREATE INDEX "template_slots_version_id_idx" ON "template_slots" USING btree ("template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_version_unique_idx" ON "template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE INDEX "template_versions_template_id_idx" ON "template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_versions_checksum_idx" ON "template_versions" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "templates_user_id_idx" ON "templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "templates_category_idx" ON "templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "templates_is_public_idx" ON "templates" USING btree ("is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "render_jobs_idempotency_key_idx" ON "render_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "render_jobs_user_id_idx" ON "render_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "render_jobs_project_id_idx" ON "render_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "render_jobs_status_idx" ON "render_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "render_jobs_created_at_idx" ON "render_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");