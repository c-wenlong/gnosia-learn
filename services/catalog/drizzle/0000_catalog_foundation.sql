CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"path" text,
	"url" text,
	"content_hash" text,
	"bytes" bigint,
	"title" text,
	"source_repo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_kind_check" CHECK (kind in ('video', 'transcript', 'chapters', 'captions', 'diagram_source', 'diagram_svg', 'note', 'session', 'link')),
	CONSTRAINT "asset_source_repo_check" CHECK (source_repo in ('gnosia', 'manimkc', 'tldrawkc')),
	CONSTRAINT "asset_location_check" CHECK (num_nonnulls(path, url) = 1),
	CONSTRAINT "asset_bytes_check" CHECK (bytes is null or bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "asset_concept" (
	"asset_id" text NOT NULL,
	"concept_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_concept_asset_id_concept_slug_pk" PRIMARY KEY("asset_id","concept_slug")
);
--> statement-breakpoint
CREATE TABLE "asset_derivation" (
	"asset_id" text NOT NULL,
	"source_asset_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_derivation_asset_id_source_asset_id_pk" PRIMARY KEY("asset_id","source_asset_id"),
	CONSTRAINT "asset_derivation_no_self_check" CHECK (asset_id <> source_asset_id)
);
--> statement-breakpoint
CREATE TABLE "asset_topic" (
	"asset_id" text NOT NULL,
	"topic_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_topic_asset_id_topic_slug_pk" PRIMARY KEY("asset_id","topic_slug")
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"parent_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_parent_slug_key" UNIQUE NULLS NOT DISTINCT("parent_id","slug"),
	CONSTRAINT "collection_kind_check" CHECK (kind in ('course', 'module', 'deck')),
	CONSTRAINT "collection_not_own_parent_check" CHECK (parent_id is distinct from id)
);
--> statement-breakpoint
CREATE TABLE "collection_item" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"collection_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"topic_slug" text,
	"concept_slug" text,
	"asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_item_one_target_check" CHECK (num_nonnulls(topic_slug, concept_slug, asset_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "concept" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"topic_slug" text,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_curriculum_item" (
	"concept_slug" text NOT NULL,
	"curriculum_item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_curriculum_item_concept_slug_curriculum_item_id_pk" PRIMARY KEY("concept_slug","curriculum_item_id")
);
--> statement-breakpoint
CREATE TABLE "concept_prerequisite" (
	"concept_slug" text NOT NULL,
	"prerequisite_slug" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_prerequisite_concept_slug_prerequisite_slug_kind_pk" PRIMARY KEY("concept_slug","prerequisite_slug","kind"),
	CONSTRAINT "concept_prerequisite_kind_check" CHECK (kind in ('requires', 'assumes')),
	CONSTRAINT "concept_prerequisite_no_self_check" CHECK (concept_slug <> prerequisite_slug)
);
--> statement-breakpoint
CREATE TABLE "curriculum_item" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"subtopics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_item_topic" (
	"curriculum_item_id" text NOT NULL,
	"topic_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_item_topic_curriculum_item_id_topic_slug_pk" PRIMARY KEY("curriculum_item_id","topic_slug")
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"learner_id" text NOT NULL,
	"type" text NOT NULL,
	"concept_slug" text,
	"session_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_type_check" CHECK (type in ('session-start', 'observation', 'review', 'session-close', 'void')),
	CONSTRAINT "event_payload_object_check" CHECK (jsonb_typeof(payload) = 'object')
);
--> statement-breakpoint
CREATE TABLE "learner" (
	"id" text PRIMARY KEY DEFAULT 'local' NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mastery" (
	"learner_id" text NOT NULL,
	"concept_slug" text NOT NULL,
	"p_l" double precision DEFAULT 0.25 NOT NULL,
	"observations" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_learner_id_concept_slug_pk" PRIMARY KEY("learner_id","concept_slug"),
	CONSTRAINT "mastery_p_l_check" CHECK (p_l >= 0 and p_l <= 1),
	CONSTRAINT "mastery_counts_check" CHECK (observations >= 0 and correct >= 0 and correct <= observations)
);
--> statement-breakpoint
CREATE TABLE "preference" (
	"learner_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_learner_id_key_pk" PRIMARY KEY("learner_id","key")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"learner_id" text NOT NULL,
	"curriculum_item_id" text NOT NULL,
	"completed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_learner_id_curriculum_item_id_pk" PRIMARY KEY("learner_id","curriculum_item_id")
);
--> statement-breakpoint
CREATE TABLE "recap" (
	"learner_id" text NOT NULL,
	"curriculum_item_id" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"misconceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recap_learner_id_curriculum_item_id_pk" PRIMARY KEY("learner_id","curriculum_item_id"),
	CONSTRAINT "recap_source_check" CHECK (source in ('agent', 'manual')),
	CONSTRAINT "recap_summary_length_check" CHECK (char_length(summary) <= 1200),
	CONSTRAINT "recap_key_points_check" CHECK (jsonb_typeof(key_points) = 'array' and jsonb_array_length(key_points) <= 8),
	CONSTRAINT "recap_misconceptions_check" CHECK (jsonb_typeof(misconceptions) = 'array' and jsonb_array_length(misconceptions) <= 8),
	CONSTRAINT "recap_open_questions_check" CHECK (jsonb_typeof(open_questions) = 'array' and jsonb_array_length(open_questions) <= 8),
	CONSTRAINT "recap_sessions_check" CHECK (sessions >= 0)
);
--> statement-breakpoint
CREATE TABLE "review" (
	"learner_id" text NOT NULL,
	"concept_slug" text NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"ease" double precision DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"last_reviewed" timestamp with time zone,
	"leech" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_learner_id_concept_slug_pk" PRIMARY KEY("learner_id","concept_slug"),
	CONSTRAINT "review_ease_check" CHECK (ease >= 1.3),
	CONSTRAINT "review_interval_days_check" CHECK (interval_days >= 1 and interval_days <= 36500),
	CONSTRAINT "review_counts_check" CHECK (repetitions >= 0 and lapses >= 0)
);
--> statement-breakpoint
ALTER TABLE "asset_concept" ADD CONSTRAINT "asset_concept_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_concept" ADD CONSTRAINT "asset_concept_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_derivation" ADD CONSTRAINT "asset_derivation_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_derivation" ADD CONSTRAINT "asset_derivation_source_asset_id_asset_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_topic" ADD CONSTRAINT "asset_topic_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_topic" ADD CONSTRAINT "asset_topic_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_parent_id_collection_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept_curriculum_item" ADD CONSTRAINT "concept_curriculum_item_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept_curriculum_item" ADD CONSTRAINT "concept_curriculum_item_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD CONSTRAINT "concept_prerequisite_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD CONSTRAINT "concept_prerequisite_prerequisite_slug_concept_slug_fk" FOREIGN KEY ("prerequisite_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD CONSTRAINT "curriculum_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item_topic" ADD CONSTRAINT "curriculum_item_topic_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item_topic" ADD CONSTRAINT "curriculum_item_topic_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "preference" ADD CONSTRAINT "preference_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recap" ADD CONSTRAINT "recap_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recap" ADD CONSTRAINT "recap_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_repo_path_key" ON "asset" USING btree ("source_repo","path");--> statement-breakpoint
CREATE INDEX "asset_kind_idx" ON "asset" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "asset_content_hash_idx" ON "asset" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "asset_concept_concept_slug_idx" ON "asset_concept" USING btree ("concept_slug");--> statement-breakpoint
CREATE INDEX "asset_derivation_source_asset_id_idx" ON "asset_derivation" USING btree ("source_asset_id");--> statement-breakpoint
CREATE INDEX "asset_topic_topic_slug_idx" ON "asset_topic" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "collection_parent_id_idx" ON "collection" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "collection_item_collection_id_idx" ON "collection_item" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_item_topic_slug_idx" ON "collection_item" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "collection_item_concept_slug_idx" ON "collection_item" USING btree ("concept_slug");--> statement-breakpoint
CREATE INDEX "collection_item_asset_id_idx" ON "collection_item" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_item_topic_key" ON "collection_item" USING btree ("collection_id","topic_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_item_concept_key" ON "collection_item" USING btree ("collection_id","concept_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_item_asset_key" ON "collection_item" USING btree ("collection_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_path_key" ON "concept" USING btree ("path");--> statement-breakpoint
CREATE INDEX "concept_topic_slug_idx" ON "concept" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "concept_curriculum_item_curriculum_item_id_idx" ON "concept_curriculum_item" USING btree ("curriculum_item_id");--> statement-breakpoint
CREATE INDEX "concept_prerequisite_prerequisite_slug_idx" ON "concept_prerequisite" USING btree ("prerequisite_slug");--> statement-breakpoint
CREATE INDEX "curriculum_item_collection_id_idx" ON "curriculum_item" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "curriculum_item_topic_topic_slug_idx" ON "curriculum_item_topic" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "topic_domain_idx" ON "topic" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "event_at_idx" ON "event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "event_learner_id_idx" ON "event" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "event_concept_slug_idx" ON "event" USING btree ("concept_slug");--> statement-breakpoint
CREATE INDEX "event_session_id_idx" ON "event" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "mastery_concept_slug_idx" ON "mastery" USING btree ("concept_slug");--> statement-breakpoint
CREATE INDEX "progress_curriculum_item_id_idx" ON "progress" USING btree ("curriculum_item_id");--> statement-breakpoint
CREATE INDEX "recap_curriculum_item_id_idx" ON "recap" USING btree ("curriculum_item_id");--> statement-breakpoint
CREATE INDEX "review_due_idx" ON "review" USING btree ("due");--> statement-breakpoint
CREATE INDEX "review_concept_slug_idx" ON "review" USING btree ("concept_slug");