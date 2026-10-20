CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text,
	`url` text,
	`content_hash` text,
	`inputs_hash` text,
	`bytes` integer,
	`title` text,
	`source_repo` text NOT NULL,
	`blob_key` text,
	`resource_type` text,
	`generated_by` text,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`blob_key`) REFERENCES `blob_object`(`key`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "asset_kind_check" CHECK(kind in ('video', 'transcript', 'chapters', 'captions', 'diagram_source', 'diagram_svg', 'note', 'session', 'link', 'poster', 'pdf')),
	CONSTRAINT "asset_source_repo_check" CHECK(source_repo in ('self-learn', 'manimkc', 'tldrawkc', 'remotionkc', 'revideokc', 'blenderkc')),
	CONSTRAINT "asset_location_check" CHECK((url is null) = (path is not null or blob_key is not null)),
	CONSTRAINT "asset_stored_blob_check" CHECK(kind not in ('video', 'transcript', 'chapters', 'captions', 'poster', 'pdf', 'diagram_svg') or blob_key is not null),
	CONSTRAINT "asset_bytes_check" CHECK(bytes is null or bytes >= 0),
	CONSTRAINT "asset_resource_type_check" CHECK(resource_type is null or (kind = 'link' and resource_type in ('paper', 'docs', 'video', 'book', 'other', 'practice'))),
	CONSTRAINT "asset_generated_by_check" CHECK(generated_by is null or generated_by in ('manimkc', 'remotionkc', 'revideokc', 'blenderkc', 'tldrawkc', 'video', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_repo_path_key` ON `asset` (`source_repo`,`path`);--> statement-breakpoint
CREATE INDEX `asset_kind_idx` ON `asset` (`kind`);--> statement-breakpoint
CREATE INDEX `asset_content_hash_idx` ON `asset` (`content_hash`);--> statement-breakpoint
CREATE INDEX `asset_blob_key_idx` ON `asset` (`blob_key`);--> statement-breakpoint
CREATE INDEX `asset_owner_id_idx` ON `asset` (`owner_id`);--> statement-breakpoint
CREATE TABLE `asset_concept` (
	`asset_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `concept_slug`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_concept_concept_slug_idx` ON `asset_concept` (`concept_slug`);--> statement-breakpoint
CREATE TABLE `asset_derivation` (
	`asset_id` text NOT NULL,
	`source_asset_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `source_asset_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "asset_derivation_no_self_check" CHECK(asset_id <> source_asset_id)
);
--> statement-breakpoint
CREATE INDEX `asset_derivation_source_asset_id_idx` ON `asset_derivation` (`source_asset_id`);--> statement-breakpoint
CREATE TABLE `asset_topic` (
	`asset_id` text NOT NULL,
	`topic_slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `topic_slug`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_topic_topic_slug_idx` ON `asset_topic` (`topic_slug`);--> statement-breakpoint
CREATE TABLE `blob_object` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`mime` text NOT NULL,
	`provider` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "blob_object_sha256_check" CHECK(sha256 regexp '^[0-9a-f]{64}$'),
	CONSTRAINT "blob_object_key_check" CHECK(key regexp '^[a-z0-9][a-z0-9_-]{0,63}/[0-9a-f]{64}[.][a-z0-9]{1,16}$' and substr(key, 1, length(owner_id) + length(sha256) + 1) = owner_id || '/' || sha256),
	CONSTRAINT "blob_object_bytes_check" CHECK(bytes >= 0),
	CONSTRAINT "blob_object_provider_check" CHECK(provider in ('fs', 'vercel-blob', 'r2')),
	CONSTRAINT "blob_object_state_check" CHECK(state in ('pending', 'present')),
	CONSTRAINT "blob_object_confirmed_check" CHECK(state <> 'present' or confirmed_at is not null)
);
--> statement-breakpoint
CREATE INDEX `blob_object_owner_id_idx` ON `blob_object` (`owner_id`);--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`parent_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`archived_at` integer,
	`cover_blob_key` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `collection`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cover_blob_key`) REFERENCES `blob_object`(`key`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "collection_id_check" CHECK(id regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "collection_kind_check" CHECK(kind in ('course', 'module', 'deck')),
	CONSTRAINT "collection_not_own_parent_check" CHECK(parent_id is not id),
	CONSTRAINT "collection_cover_course_check" CHECK(cover_blob_key is null or kind = 'course'),
	CONSTRAINT "collection_cover_credit_check" CHECK((cover_blob_key is null) = (json_type(metadata, '$.coverCredit') is null))
);
--> statement-breakpoint
CREATE INDEX `collection_parent_id_idx` ON `collection` (`parent_id`);--> statement-breakpoint
CREATE INDEX `collection_owner_id_idx` ON `collection` (`owner_id`);--> statement-breakpoint
CREATE INDEX `collection_cover_blob_key_idx` ON `collection` (`cover_blob_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_parent_slug_key` ON `collection` (case when "parent_id" is null then '' else "parent_id" end,`slug`) WHERE archived_at is null;--> statement-breakpoint
CREATE TABLE `collection_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`topic_slug` text,
	`concept_slug` text,
	`asset_id` text,
	`topic_position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "collection_item_one_target_check" CHECK((topic_slug is not null) + (concept_slug is not null) + (asset_id is not null) = 1)
);
--> statement-breakpoint
CREATE INDEX `collection_item_collection_id_idx` ON `collection_item` (`collection_id`);--> statement-breakpoint
CREATE INDEX `collection_item_topic_slug_idx` ON `collection_item` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `collection_item_concept_slug_idx` ON `collection_item` (`concept_slug`);--> statement-breakpoint
CREATE INDEX `collection_item_asset_id_idx` ON `collection_item` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_topic_key` ON `collection_item` (`collection_id`,`topic_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_concept_key` ON `collection_item` (`collection_id`,`concept_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_asset_key` ON `collection_item` (`collection_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `collection_tag` (
	`collection_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`collection_id`, `tag_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `collection_tag_tag_id_idx` ON `collection_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `concept` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`topic_slug` text NOT NULL,
	`path` text NOT NULL,
	`domain` text,
	`body` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`authored_at` integer,
	`topic_position` integer DEFAULT 0 NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "concept_slug_check" CHECK(slug regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "concept_tags_array_check" CHECK(json_type(tags) = 'array'),
	CONSTRAINT "concept_sources_array_check" CHECK(json_type(sources) = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_path_key` ON `concept` (`path`);--> statement-breakpoint
CREATE INDEX `concept_topic_slug_idx` ON `concept` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `concept_owner_id_idx` ON `concept` (`owner_id`);--> statement-breakpoint
CREATE TABLE `concept_curriculum_item` (
	`concept_slug` text NOT NULL,
	`curriculum_item_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`concept_slug`, `curriculum_item_id`),
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`curriculum_item_id`) REFERENCES `curriculum_item`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concept_curriculum_item_curriculum_item_id_idx` ON `concept_curriculum_item` (`curriculum_item_id`);--> statement-breakpoint
CREATE TABLE `concept_prerequisite` (
	`concept_slug` text NOT NULL,
	`prerequisite_slug` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`concept_slug`, `prerequisite_slug`, `kind`),
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`prerequisite_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "concept_prerequisite_kind_check" CHECK(kind in ('requires', 'assumes')),
	CONSTRAINT "concept_prerequisite_no_self_check" CHECK(concept_slug <> prerequisite_slug)
);
--> statement-breakpoint
CREATE INDEX `concept_prerequisite_prerequisite_slug_idx` ON `concept_prerequisite` (`prerequisite_slug`);--> statement-breakpoint
CREATE TABLE `curriculum_item` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`subtopics` text DEFAULT '[]' NOT NULL,
	`videos` text DEFAULT '[]' NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "curriculum_item_id_check" CHECK(id regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "curriculum_item_videos_array_check" CHECK(json_type(videos) = 'array')
);
--> statement-breakpoint
CREATE INDEX `curriculum_item_collection_id_idx` ON `curriculum_item` (`collection_id`);--> statement-breakpoint
CREATE INDEX `curriculum_item_owner_id_idx` ON `curriculum_item` (`owner_id`);--> statement-breakpoint
CREATE TABLE `curriculum_item_asset` (
	`curriculum_item_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`curriculum_item_id`, `asset_id`),
	FOREIGN KEY (`curriculum_item_id`) REFERENCES `curriculum_item`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `curriculum_item_asset_asset_id_idx` ON `curriculum_item_asset` (`asset_id`);--> statement-breakpoint
CREATE TABLE `curriculum_item_topic` (
	`curriculum_item_id` text NOT NULL,
	`topic_slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`curriculum_item_id`, `topic_slug`),
	FOREIGN KEY (`curriculum_item_id`) REFERENCES `curriculum_item`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `curriculum_item_topic_topic_slug_idx` ON `curriculum_item_topic` (`topic_slug`);--> statement-breakpoint
CREATE TABLE `diagram` (
	`slug` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`title` text,
	`topic_slug` text NOT NULL,
	`document` text NOT NULL,
	`document_hash` text NOT NULL,
	`svg_blob_key` text,
	`svg_document_hash` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`svg_blob_key`) REFERENCES `blob_object`(`key`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "diagram_slug_check" CHECK(slug regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "diagram_document_object_check" CHECK(json_type(document) = 'object'),
	CONSTRAINT "diagram_svg_pair_check" CHECK((svg_blob_key is null) = (svg_document_hash is null))
);
--> statement-breakpoint
CREATE INDEX `diagram_owner_id_idx` ON `diagram` (`owner_id`);--> statement-breakpoint
CREATE INDEX `diagram_topic_slug_idx` ON `diagram` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `diagram_svg_blob_key_idx` ON `diagram` (`svg_blob_key`);--> statement-breakpoint
CREATE TABLE `manimkc_topic` (
	`path` text PRIMARY KEY NOT NULL,
	`topic_slug` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `manimkc_topic_topic_slug_idx` ON `manimkc_topic` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `manimkc_topic_owner_id_idx` ON `manimkc_topic` (`owner_id`);--> statement-breakpoint
CREATE TABLE `session_log_entry` (
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`markdown` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`session_id`, `seq`),
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "session_log_entry_seq_check" CHECK(seq >= 1)
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "tag_id_check" CHECK(id regexp '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE INDEX `tag_owner_id_idx` ON `tag` (`owner_id`);--> statement-breakpoint
CREATE TABLE `topic` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`domain` text NOT NULL,
	`summary` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "topic_slug_check" CHECK(slug regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "topic_aliases_array_check" CHECK(json_type(aliases) = 'array')
);
--> statement-breakpoint
CREATE INDEX `topic_domain_idx` ON `topic` (`domain`);--> statement-breakpoint
CREATE INDEX `topic_owner_id_idx` ON `topic` (`owner_id`);--> statement-breakpoint
CREATE TABLE `topic_relation` (
	`from_slug` text NOT NULL,
	`to_slug` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`from_slug`, `to_slug`, `kind`),
	FOREIGN KEY (`from_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`to_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "topic_relation_kind_check" CHECK(kind in ('broader', 'related', 'precedes')),
	CONSTRAINT "topic_relation_no_self_check" CHECK(from_slug <> to_slug),
	CONSTRAINT "topic_relation_related_order_check" CHECK(kind <> 'related' or from_slug collate binary < to_slug collate binary)
);
--> statement-breakpoint
CREATE INDEX `topic_relation_to_slug_idx` ON `topic_relation` (`to_slug`);--> statement-breakpoint
CREATE INDEX `topic_relation_owner_id_idx` ON `topic_relation` (`owner_id`);--> statement-breakpoint
CREATE TABLE `video` (
	`slug` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`title` text,
	`topic_slug` text NOT NULL,
	`source` text NOT NULL,
	`source_hash` text NOT NULL,
	`mp4_blob_key` text,
	`rendered_source_hash` text,
	`duration_seconds` real,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mp4_blob_key`) REFERENCES `blob_object`(`key`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "video_slug_check" CHECK(slug regexp '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "video_source_object_check" CHECK(json_type(source) = 'object'),
	CONSTRAINT "video_source_hash_check" CHECK(source_hash regexp '^[0-9a-f]{64}$'),
	CONSTRAINT "video_mp4_pair_check" CHECK((mp4_blob_key is null) = (rendered_source_hash is null)),
	CONSTRAINT "video_duration_check" CHECK(duration_seconds is null or duration_seconds > 0)
);
--> statement-breakpoint
CREATE INDEX `video_owner_id_idx` ON `video` (`owner_id`);--> statement-breakpoint
CREATE INDEX `video_topic_slug_idx` ON `video` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `video_mp4_blob_key_idx` ON `video` (`mp4_blob_key`);--> statement-breakpoint
CREATE TABLE `index_run` (
	`source` text PRIMARY KEY NOT NULL,
	`source_root` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`written` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`counts` text DEFAULT '{}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "index_run_source_check" CHECK(source in ('topics', 'tags', 'courses', 'concepts', 'manimkc', 'remotionkc', 'revideokc', 'blenderkc', 'diagrams', 'sessions', 'mirrors')),
	CONSTRAINT "index_run_written_check" CHECK(written >= 0 and deleted >= 0),
	CONSTRAINT "index_run_order_check" CHECK(finished_at >= started_at)
);
--> statement-breakpoint
CREATE TABLE `mirror` (
	`asset_id` text NOT NULL,
	`destination` text NOT NULL,
	`root` text NOT NULL,
	`status` text NOT NULL,
	`compared` text NOT NULL,
	`bytes` integer,
	`mtime` integer,
	`checked_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `destination`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "mirror_status_check" CHECK(status in ('present', 'stale', 'missing', 'unknown')),
	CONSTRAINT "mirror_compared_check" CHECK(compared in ('sha256', 'bytes', 'size+mtime', 'none')),
	CONSTRAINT "mirror_bytes_check" CHECK(bytes is null or bytes >= 0)
);
--> statement-breakpoint
CREATE INDEX `mirror_status_idx` ON `mirror` (`status`);--> statement-breakpoint
CREATE INDEX `mirror_destination_idx` ON `mirror` (`destination`);--> statement-breakpoint
CREATE TABLE `asset_name` (
	`learner_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `asset_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "asset_name_title_check" CHECK(length(title) between 1 and 200 and title = trim(title) and not (title regexp '\s{2}|[\n\r\t]'))
);
--> statement-breakpoint
CREATE INDEX `asset_name_asset_id_idx` ON `asset_name` (`asset_id`);--> statement-breakpoint
CREATE TABLE `custom_provider` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "custom_provider_id_check" CHECK(id regexp '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
	CONSTRAINT "custom_provider_label_check" CHECK(length(label) between 1 and 60),
	CONSTRAINT "custom_provider_base_url_check" CHECK(length(base_url) between 1 and 300 and not (base_url regexp '/$') and (base_url regexp '^https://[^/@?#\s]+(/[^@?#\s]*)?$' or base_url regexp '^http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]+)?(/[^@?#\s]*)?$'))
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`learner_id` text NOT NULL,
	`type` text NOT NULL,
	`concept_slug` text,
	`session_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "event_type_check" CHECK(type in ('session-start', 'observation', 'review', 'session-close', 'void', 'watched', 'visit')),
	CONSTRAINT "event_payload_object_check" CHECK(json_type(payload) = 'object')
);
--> statement-breakpoint
CREATE INDEX `event_at_idx` ON `event` (`at`);--> statement-breakpoint
CREATE INDEX `event_learner_id_idx` ON `event` (`learner_id`);--> statement-breakpoint
CREATE INDEX `event_concept_slug_idx` ON `event` (`concept_slug`);--> statement-breakpoint
CREATE INDEX `event_session_id_idx` ON `event` (`session_id`);--> statement-breakpoint
CREATE TABLE `learner` (
	`id` text PRIMARY KEY DEFAULT 'local' NOT NULL,
	`display_name` text,
	`avatar` text DEFAULT (json_extract('["owl","cat","bookworm","fox","hedgehog","raven","frog","mouse","moth","tortoise","rabbit","bat"]', '$[' || (abs(random()) % 12) || ']')) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "learner_avatar_check" CHECK(avatar in ('owl', 'cat', 'bookworm', 'fox', 'hedgehog', 'raven', 'frog', 'mouse', 'moth', 'tortoise', 'rabbit', 'bat'))
);
--> statement-breakpoint
CREATE TABLE `mastery` (
	`learner_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`p_l` real DEFAULT 0.25 NOT NULL,
	`observations` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`last_seen` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `concept_slug`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "mastery_p_l_check" CHECK(p_l >= 0 and p_l <= 1),
	CONSTRAINT "mastery_counts_check" CHECK(observations >= 0 and correct >= 0 and correct <= observations)
);
--> statement-breakpoint
CREATE INDEX `mastery_concept_slug_idx` ON `mastery` (`concept_slug`);--> statement-breakpoint
CREATE TABLE `preference` (
	`learner_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `key`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`learner_id` text NOT NULL,
	`curriculum_item_id` text NOT NULL,
	`completed_at` integer,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `curriculum_item_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`curriculum_item_id`) REFERENCES `curriculum_item`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `progress_curriculum_item_id_idx` ON `progress` (`curriculum_item_id`);--> statement-breakpoint
CREATE TABLE `provider_key` (
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` blob NOT NULL,
	`iv` blob NOT NULL,
	`auth_tag` blob NOT NULL,
	`key_version` integer NOT NULL,
	`last4` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`owner_id`, `provider`),
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "provider_key_provider_check" CHECK((provider in ('nvidia', 'gemini', 'openrouter', 'openai', 'anthropic', 'deepseek', 'glm', 'qwen', 'moonshot', 'minimax', 'mimo', 'mistral', 'groq', 'xai') or provider regexp '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')),
	CONSTRAINT "provider_key_iv_check" CHECK(length(iv) = 12),
	CONSTRAINT "provider_key_auth_tag_check" CHECK(length(auth_tag) = 16),
	CONSTRAINT "provider_key_ciphertext_check" CHECK(length(ciphertext) between 1 and 2048),
	CONSTRAINT "provider_key_key_version_check" CHECK(key_version >= 1),
	CONSTRAINT "provider_key_last4_check" CHECK(length(last4) = 4)
);
--> statement-breakpoint
CREATE TABLE `recap` (
	`learner_id` text NOT NULL,
	`curriculum_item_id` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`key_points` text DEFAULT '[]' NOT NULL,
	`misconceptions` text DEFAULT '[]' NOT NULL,
	`open_questions` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `curriculum_item_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`curriculum_item_id`) REFERENCES `curriculum_item`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "recap_source_check" CHECK(source in ('agent', 'manual')),
	CONSTRAINT "recap_summary_length_check" CHECK(length(summary) <= 1200),
	CONSTRAINT "recap_key_points_check" CHECK(json_type(key_points) = 'array' and json_array_length(key_points) <= 8),
	CONSTRAINT "recap_misconceptions_check" CHECK(json_type(misconceptions) = 'array' and json_array_length(misconceptions) <= 8),
	CONSTRAINT "recap_open_questions_check" CHECK(json_type(open_questions) = 'array' and json_array_length(open_questions) <= 8),
	CONSTRAINT "recap_sessions_check" CHECK(sessions >= 0)
);
--> statement-breakpoint
CREATE INDEX `recap_curriculum_item_id_idx` ON `recap` (`curriculum_item_id`);--> statement-breakpoint
CREATE TABLE `review` (
	`learner_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`ease` real DEFAULT 2.5 NOT NULL,
	`interval_days` integer DEFAULT 1 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due` integer NOT NULL,
	`last_reviewed` integer,
	`leech` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `concept_slug`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "review_ease_check" CHECK(ease >= 1.3),
	CONSTRAINT "review_interval_days_check" CHECK(interval_days >= 1 and interval_days <= 36500),
	CONSTRAINT "review_counts_check" CHECK(repetitions >= 0 and lapses >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_due_idx` ON `review` (`due`);--> statement-breakpoint
CREATE INDEX `review_concept_slug_idx` ON `review` (`concept_slug`);--> statement-breakpoint
CREATE TABLE `tutor_model` (
	`owner_id` text NOT NULL,
	`position` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`owner_id`, `provider`, `model`),
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "tutor_model_provider_check" CHECK((provider in ('nvidia', 'gemini', 'openrouter', 'openai', 'anthropic', 'deepseek', 'glm', 'qwen', 'moonshot', 'minimax', 'mimo', 'mistral', 'groq', 'xai') or provider regexp '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')),
	CONSTRAINT "tutor_model_position_check" CHECK(position between 0 and 9),
	CONSTRAINT "tutor_model_model_check" CHECK(length(model) between 1 and 200 and model regexp '^[!-~]+$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_model_owner_position_idx` ON `tutor_model` (`owner_id`,`position`);--> statement-breakpoint
CREATE TABLE `asset_job` (
	`asset_id` text NOT NULL,
	`job_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`bytes` integer NOT NULL,
	`written_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `job_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "asset_job_bytes_check" CHECK(bytes >= 0)
);
--> statement-breakpoint
CREATE INDEX `asset_job_job_id_idx` ON `asset_job` (`job_id`);--> statement-breakpoint
CREATE INDEX `asset_job_owner_id_idx` ON `asset_job` (`owner_id`);--> statement-breakpoint
CREATE TABLE `draft` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`kind` text DEFAULT 'diagram' NOT NULL,
	`source` text,
	`title` text,
	`name` text,
	`planner_session_id` text NOT NULL,
	`transcript_path` text NOT NULL,
	`brief` text,
	`brief_at` integer,
	`pending_topic` text,
	`turns` integer DEFAULT 0 NOT NULL,
	`cost_usd` real,
	`cost_source` text,
	`error_kind` text,
	`error` text,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "draft_state_check" CHECK(state in ('open', 'briefed', 'drawing', 'done', 'abandoned')),
	CONSTRAINT "draft_kind_check" CHECK(kind in ('diagram', 'video')),
	CONSTRAINT "draft_brief_object_check" CHECK(brief is null or json_type(brief) = 'object'),
	CONSTRAINT "draft_pending_topic_object_check" CHECK(pending_topic is null or json_type(pending_topic) = 'object'),
	CONSTRAINT "draft_pending_topic_brief_check" CHECK(pending_topic is null or brief is not null),
	CONSTRAINT "draft_name_check" CHECK(name is null or length(name) between 1 and 200),
	CONSTRAINT "draft_turns_check" CHECK(turns >= 0),
	CONSTRAINT "draft_cost_usd_check" CHECK(cost_usd is null or cost_usd >= 0),
	CONSTRAINT "draft_cost_source_check" CHECK(cost_source is null or cost_source in ('result', 'stream')),
	CONSTRAINT "draft_cost_source_paired_check" CHECK(cost_source is null or cost_usd is not null),
	CONSTRAINT "draft_error_kind_check" CHECK(error_kind is null or error_kind in ('agent', 'brief-invalid', 'timeout', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX `draft_owner_id_idx` ON `draft` (`owner_id`);--> statement-breakpoint
CREATE INDEX `draft_state_idx` ON `draft` (`state`);--> statement-breakpoint
CREATE INDEX `draft_updated_at_idx` ON `draft` (`updated_at`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`parent_job_id` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`phase` text,
	`topic_slug` text NOT NULL,
	`target_path` text NOT NULL,
	`candidate_path` text,
	`target_hash_before` text,
	`brief` text DEFAULT '{}' NOT NULL,
	`gate` text,
	`idempotency_key` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`requested_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`reviewed_at` integer,
	`heartbeat_at` integer,
	`cancel_requested_at` integer,
	`runner` text,
	`runner_job_id` text,
	`exit_code` integer,
	`turns` integer,
	`cost_usd` real,
	`cost_source` text,
	`error_kind` text,
	`error` text,
	`error_detail` text,
	`draft_id` text,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`parent_job_id`) REFERENCES `job`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`draft_id`) REFERENCES `draft`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "job_kind_check" CHECK(kind in ('diagram', 'video')),
	CONSTRAINT "job_state_check" CHECK(state in ('queued', 'running', 'awaiting_review', 'accepted', 'discarded', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "job_brief_object_check" CHECK(json_type(brief) = 'object'),
	CONSTRAINT "job_gate_object_check" CHECK(gate is null or json_type(gate) = 'object'),
	CONSTRAINT "job_error_detail_object_check" CHECK(error_detail is null or json_type(error_detail) = 'object'),
	CONSTRAINT "job_attempt_check" CHECK(attempt >= 0),
	CONSTRAINT "job_turns_check" CHECK(turns is null or turns >= 0),
	CONSTRAINT "job_cost_usd_check" CHECK(cost_usd is null or cost_usd >= 0),
	CONSTRAINT "job_cost_source_check" CHECK(cost_source is null or cost_source in ('result', 'stream')),
	CONSTRAINT "job_cost_source_paired_check" CHECK(cost_source is null or cost_usd is not null),
	CONSTRAINT "job_not_own_parent_check" CHECK(parent_job_id is not id),
	CONSTRAINT "job_started_at_check" CHECK(started_at is null or started_at >= requested_at),
	CONSTRAINT "job_finished_at_check" CHECK(finished_at is null or started_at is null or finished_at >= started_at),
	CONSTRAINT "job_queued_check" CHECK(state <> 'queued' or (started_at is null and runner is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_key_key` ON `job` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_active_target_key` ON `job` (`target_path`) WHERE state in ('queued', 'running', 'awaiting_review');--> statement-breakpoint
CREATE INDEX `job_session_id_idx` ON `job` (`session_id`);--> statement-breakpoint
CREATE INDEX `job_state_idx` ON `job` (`state`);--> statement-breakpoint
CREATE INDEX `job_topic_slug_idx` ON `job` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `job_parent_job_id_idx` ON `job` (`parent_job_id`);--> statement-breakpoint
CREATE INDEX `job_requested_at_idx` ON `job` (`requested_at`);--> statement-breakpoint
CREATE INDEX `job_owner_id_idx` ON `job` (`owner_id`);--> statement-breakpoint
CREATE INDEX `job_draft_id_idx` ON `job` (`draft_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`learner_id` text NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`title` text,
	`goal` text,
	`agent_session_id` text,
	`log_asset_id` text,
	`started_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ended_at` integer,
	`heartbeat_at` integer,
	`error_kind` text,
	`error` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`log_asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "session_kind_check" CHECK(kind in ('tutor', 'studio')),
	CONSTRAINT "session_state_check" CHECK(state in ('running', 'closed', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "session_metadata_object_check" CHECK(json_type(metadata) = 'object'),
	CONSTRAINT "session_ended_at_check" CHECK(state <> 'running' or ended_at is null),
	CONSTRAINT "session_order_check" CHECK(ended_at is null or ended_at >= started_at)
);
--> statement-breakpoint
CREATE INDEX `session_kind_state_idx` ON `session` (`kind`,`state`);--> statement-breakpoint
CREATE INDEX `session_started_at_idx` ON `session` (`started_at`);--> statement-breakpoint
CREATE INDEX `session_learner_id_idx` ON `session` (`learner_id`);--> statement-breakpoint
CREATE INDEX `session_log_asset_id_idx` ON `session` (`log_asset_id`);--> statement-breakpoint
CREATE TABLE `catalog_instance` (
	`id` integer PRIMARY KEY DEFAULT true NOT NULL,
	`role` text DEFAULT 'primary' NOT NULL,
	`primary_host` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "catalog_instance_single_row_check" CHECK(id),
	CONSTRAINT "catalog_instance_role_check" CHECK(role in ('primary', 'copy')),
	CONSTRAINT "catalog_instance_copy_check" CHECK(role <> 'copy' or primary_host is not null)
);
--> statement-breakpoint
CREATE TABLE `content_revision` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`seq` integer NOT NULL,
	`previous_id` integer,
	`op` text NOT NULL,
	`snapshot` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`author_kind` text NOT NULL,
	`author` text NOT NULL,
	`reason` text NOT NULL,
	`job_id` text,
	`session_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`previous_id`) REFERENCES `content_revision`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "content_revision_entity_type_check" CHECK(entity_type in ('topic', 'tag', 'collection', 'curriculum_item', 'concept', 'diagram', 'asset', 'video')),
	CONSTRAINT "content_revision_op_check" CHECK(op in ('create', 'update', 'archive', 'restore', 'rename', 'import', 'delete')),
	CONSTRAINT "content_revision_author_kind_check" CHECK(author_kind in ('person', 'agent', 'import')),
	CONSTRAINT "content_revision_seq_check" CHECK(seq >= 1),
	CONSTRAINT "content_revision_previous_check" CHECK(seq = 1 or previous_id is not null),
	CONSTRAINT "content_revision_not_own_previous_check" CHECK(previous_id is not id),
	CONSTRAINT "content_revision_snapshot_object_check" CHECK(json_type(snapshot) = 'object'),
	CONSTRAINT "content_revision_snapshot_hash_check" CHECK(snapshot_hash regexp '^[0-9a-f]{64}$'),
	CONSTRAINT "content_revision_author_check" CHECK(trim(author) <> ''),
	CONSTRAINT "content_revision_reason_check" CHECK(trim(reason) <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revision_entity_seq_key` ON `content_revision` (`entity_type`,`entity_id`,`seq`);--> statement-breakpoint
CREATE INDEX `content_revision_owner_id_idx` ON `content_revision` (`owner_id`);--> statement-breakpoint
CREATE INDEX `content_revision_previous_id_idx` ON `content_revision` (`previous_id`);--> statement-breakpoint
CREATE INDEX `content_revision_job_id_idx` ON `content_revision` (`job_id`);--> statement-breakpoint
CREATE INDEX `content_revision_session_id_idx` ON `content_revision` (`session_id`);--> statement-breakpoint
CREATE INDEX `content_revision_created_at_idx` ON `content_revision` (`created_at`);--> statement-breakpoint
CREATE TABLE `content_source` (
	`type` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'files' NOT NULL,
	`flipped_at` integer,
	`parity_report` text,
	`export_hash` text,
	`exported_at` integer,
	`waivers` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "content_source_type_check" CHECK(type in ('topics', 'tags', 'courses', 'concepts', 'sessions', 'diagrams', 'manimkc')),
	CONSTRAINT "content_source_source_check" CHECK(source in ('files', 'db')),
	CONSTRAINT "content_source_flipped_check" CHECK(source <> 'db' or flipped_at is not null),
	CONSTRAINT "content_source_parity_report_check" CHECK(parity_report is null or json_type(parity_report) = 'object'),
	CONSTRAINT "content_source_waivers_check" CHECK(json_type(waivers) = 'array')
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Hand-written, as the Postgres 0010 was after its generated block: seeds
-- and the trigger machinery drizzle cannot express.
--
-- The seeds are what `drizzle/` history put in by 0010: the `local` learner
-- every `owner_id` foreign key needs, and the `catalog_instance` row saying
-- this file takes writes.
-- ---------------------------------------------------------------------
INSERT INTO `learner` (`id`) VALUES ('local') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO `catalog_instance` (`id`, `role`) VALUES (1, 'primary') ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Append-only (the Postgres `catalog_append_only` triggers of 0001/0003 and
-- 0010): history is written, not edited. `raise(abort, '<sqlstate>: …')`
-- carries the SQLSTATE in the message, where the pg functions set ERRCODE,
-- so a reader that classified by code can read the prefix instead.
CREATE TRIGGER `event_no_update` BEFORE UPDATE ON `event` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: event is append-only: UPDATE is not allowed');
END;
--> statement-breakpointCREATE TRIGGER `event_no_delete` BEFORE DELETE ON `event` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: event is append-only: DELETE is not allowed');
END;
--> statement-breakpointCREATE TRIGGER `content_revision_no_update` BEFORE UPDATE ON `content_revision` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: content_revision is append-only: UPDATE is not allowed. A revision is history. Write a new revision instead.');
END;
--> statement-breakpointCREATE TRIGGER `content_revision_no_delete` BEFORE DELETE ON `content_revision` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: content_revision is append-only: DELETE is not allowed. A revision is history. Write a new revision instead.');
END;
--> statement-breakpointCREATE TRIGGER `session_log_entry_no_update` BEFORE UPDATE ON `session_log_entry` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: session_log_entry is append-only: UPDATE is not allowed. A session log records what happened. Append a correcting entry, or fix the note it touched.');
END;
--> statement-breakpointCREATE TRIGGER `session_log_entry_no_delete` BEFORE DELETE ON `session_log_entry` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: session_log_entry is append-only: DELETE is not allowed. A session log records what happened. Append a correcting entry, or fix the note it touched.');
END;
--> statement-breakpoint
-- The copy guard (D2, edge case 14): on a database whose `catalog_instance`
-- says `copy`, every write to every other table is refused. Per statement in
-- Postgres; per row here, which is the one deliberate narrowing — a statement
-- that touches nothing reaches no trigger, so a zero-row write aimed at the
-- wrong database lands silently where Postgres refused it. SQLite triggers
-- take one event each (no `INSERT OR UPDATE OR DELETE`), so every table gets
-- three. `catalog_copy_ok()` is the per-connection function `connect`
-- registers (the `self_learn.copy_ok` setting it replaces); `catalog_instance`
-- itself is not guarded, so a copy can be promoted.
CREATE TRIGGER `learner_copy_guard_ins` BEFORE INSERT ON `learner` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `learner_copy_guard_upd` BEFORE UPDATE ON `learner` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `learner_copy_guard_del` BEFORE DELETE ON `learner` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `blob_object_copy_guard_ins` BEFORE INSERT ON `blob_object` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `blob_object_copy_guard_upd` BEFORE UPDATE ON `blob_object` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `blob_object_copy_guard_del` BEFORE DELETE ON `blob_object` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_copy_guard_ins` BEFORE INSERT ON `topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_copy_guard_upd` BEFORE UPDATE ON `topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_copy_guard_del` BEFORE DELETE ON `topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tag_copy_guard_ins` BEFORE INSERT ON `tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tag_copy_guard_upd` BEFORE UPDATE ON `tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tag_copy_guard_del` BEFORE DELETE ON `tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_relation_copy_guard_ins` BEFORE INSERT ON `topic_relation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_relation_copy_guard_upd` BEFORE UPDATE ON `topic_relation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `topic_relation_copy_guard_del` BEFORE DELETE ON `topic_relation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `manimkc_topic_copy_guard_ins` BEFORE INSERT ON `manimkc_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `manimkc_topic_copy_guard_upd` BEFORE UPDATE ON `manimkc_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `manimkc_topic_copy_guard_del` BEFORE DELETE ON `manimkc_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_copy_guard_ins` BEFORE INSERT ON `concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_copy_guard_upd` BEFORE UPDATE ON `concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_copy_guard_del` BEFORE DELETE ON `concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_copy_guard_ins` BEFORE INSERT ON `collection` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_copy_guard_upd` BEFORE UPDATE ON `collection` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_copy_guard_del` BEFORE DELETE ON `collection` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_tag_copy_guard_ins` BEFORE INSERT ON `collection_tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_tag_copy_guard_upd` BEFORE UPDATE ON `collection_tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_tag_copy_guard_del` BEFORE DELETE ON `collection_tag` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_copy_guard_ins` BEFORE INSERT ON `curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_copy_guard_upd` BEFORE UPDATE ON `curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_copy_guard_del` BEFORE DELETE ON `curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_copy_guard_ins` BEFORE INSERT ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_copy_guard_upd` BEFORE UPDATE ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_copy_guard_del` BEFORE DELETE ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `diagram_copy_guard_ins` BEFORE INSERT ON `diagram` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `diagram_copy_guard_upd` BEFORE UPDATE ON `diagram` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `diagram_copy_guard_del` BEFORE DELETE ON `diagram` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_topic_copy_guard_ins` BEFORE INSERT ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_topic_copy_guard_upd` BEFORE UPDATE ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_topic_copy_guard_del` BEFORE DELETE ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_concept_copy_guard_ins` BEFORE INSERT ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_concept_copy_guard_upd` BEFORE UPDATE ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_concept_copy_guard_del` BEFORE DELETE ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_prerequisite_copy_guard_ins` BEFORE INSERT ON `concept_prerequisite` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_prerequisite_copy_guard_upd` BEFORE UPDATE ON `concept_prerequisite` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_prerequisite_copy_guard_del` BEFORE DELETE ON `concept_prerequisite` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_item_copy_guard_ins` BEFORE INSERT ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_item_copy_guard_upd` BEFORE UPDATE ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `collection_item_copy_guard_del` BEFORE DELETE ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_derivation_copy_guard_ins` BEFORE INSERT ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_derivation_copy_guard_upd` BEFORE UPDATE ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_derivation_copy_guard_del` BEFORE DELETE ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_topic_copy_guard_ins` BEFORE INSERT ON `curriculum_item_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_topic_copy_guard_upd` BEFORE UPDATE ON `curriculum_item_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_topic_copy_guard_del` BEFORE DELETE ON `curriculum_item_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_curriculum_item_copy_guard_ins` BEFORE INSERT ON `concept_curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_curriculum_item_copy_guard_upd` BEFORE UPDATE ON `concept_curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `concept_curriculum_item_copy_guard_del` BEFORE DELETE ON `concept_curriculum_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_asset_copy_guard_ins` BEFORE INSERT ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_asset_copy_guard_upd` BEFORE UPDATE ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `curriculum_item_asset_copy_guard_del` BEFORE DELETE ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `video_copy_guard_ins` BEFORE INSERT ON `video` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `video_copy_guard_upd` BEFORE UPDATE ON `video` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `video_copy_guard_del` BEFORE DELETE ON `video` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_copy_guard_ins` BEFORE INSERT ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_copy_guard_upd` BEFORE UPDATE ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_copy_guard_del` BEFORE DELETE ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_log_entry_copy_guard_ins` BEFORE INSERT ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_log_entry_copy_guard_upd` BEFORE UPDATE ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `session_log_entry_copy_guard_del` BEFORE DELETE ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `event_copy_guard_ins` BEFORE INSERT ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `event_copy_guard_upd` BEFORE UPDATE ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `event_copy_guard_del` BEFORE DELETE ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mastery_copy_guard_ins` BEFORE INSERT ON `mastery` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mastery_copy_guard_upd` BEFORE UPDATE ON `mastery` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mastery_copy_guard_del` BEFORE DELETE ON `mastery` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `review_copy_guard_ins` BEFORE INSERT ON `review` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `review_copy_guard_upd` BEFORE UPDATE ON `review` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `review_copy_guard_del` BEFORE DELETE ON `review` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `progress_copy_guard_ins` BEFORE INSERT ON `progress` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `progress_copy_guard_upd` BEFORE UPDATE ON `progress` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `progress_copy_guard_del` BEFORE DELETE ON `progress` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `recap_copy_guard_ins` BEFORE INSERT ON `recap` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `recap_copy_guard_upd` BEFORE UPDATE ON `recap` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `recap_copy_guard_del` BEFORE DELETE ON `recap` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `preference_copy_guard_ins` BEFORE INSERT ON `preference` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `preference_copy_guard_upd` BEFORE UPDATE ON `preference` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `preference_copy_guard_del` BEFORE DELETE ON `preference` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `provider_key_copy_guard_ins` BEFORE INSERT ON `provider_key` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `provider_key_copy_guard_upd` BEFORE UPDATE ON `provider_key` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `provider_key_copy_guard_del` BEFORE DELETE ON `provider_key` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `custom_provider_copy_guard_ins` BEFORE INSERT ON `custom_provider` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `custom_provider_copy_guard_upd` BEFORE UPDATE ON `custom_provider` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `custom_provider_copy_guard_del` BEFORE DELETE ON `custom_provider` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tutor_model_copy_guard_ins` BEFORE INSERT ON `tutor_model` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tutor_model_copy_guard_upd` BEFORE UPDATE ON `tutor_model` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `tutor_model_copy_guard_del` BEFORE DELETE ON `tutor_model` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_name_copy_guard_ins` BEFORE INSERT ON `asset_name` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_name_copy_guard_upd` BEFORE UPDATE ON `asset_name` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_name_copy_guard_del` BEFORE DELETE ON `asset_name` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `draft_copy_guard_ins` BEFORE INSERT ON `draft` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `draft_copy_guard_upd` BEFORE UPDATE ON `draft` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `draft_copy_guard_del` BEFORE DELETE ON `draft` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `job_copy_guard_ins` BEFORE INSERT ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `job_copy_guard_upd` BEFORE UPDATE ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `job_copy_guard_del` BEFORE DELETE ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_job_copy_guard_ins` BEFORE INSERT ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_job_copy_guard_upd` BEFORE UPDATE ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `asset_job_copy_guard_del` BEFORE DELETE ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_revision_copy_guard_ins` BEFORE INSERT ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_revision_copy_guard_upd` BEFORE UPDATE ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_revision_copy_guard_del` BEFORE DELETE ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `index_run_copy_guard_ins` BEFORE INSERT ON `index_run` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `index_run_copy_guard_upd` BEFORE UPDATE ON `index_run` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `index_run_copy_guard_del` BEFORE DELETE ON `index_run` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mirror_copy_guard_ins` BEFORE INSERT ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mirror_copy_guard_upd` BEFORE UPDATE ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `mirror_copy_guard_del` BEFORE DELETE ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_source_copy_guard_ins` BEFORE INSERT ON `content_source` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_source_copy_guard_upd` BEFORE UPDATE ON `content_source` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpointCREATE TRIGGER `content_source_copy_guard_del` BEFORE DELETE ON `content_source` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (catalog_instance.primary_host names it).');
END;
--> statement-breakpoint
-- The write-seam guard (D4), armed only on `video`: the one content table
-- whose Postgres guard was never disabled, because nothing outside the seam
-- had ever written it. `catalog_revision_id()` is the per-connection function
-- `connect` registers and `setRevisionId` fills; the seam sets it before
-- touching a content table, so a write that skipped the seam is refused.
-- Every other content table's guard is created by `catalog flip <type>`,
-- the moment Postgres armed its disabled trigger — the DDL lives in
-- services/catalog/src/content/guards.ts.
CREATE TRIGGER `video_write_guard_ins` BEFORE INSERT ON `video` FOR EACH ROW
	WHEN catalog_revision_id() IS NULL
BEGIN
	SELECT RAISE(ABORT, '42501: video is written only through the content write seam: write refused. Write through services/catalog/src/content/write.ts, which records who wrote it and why.');
END;
--> statement-breakpointCREATE TRIGGER `video_write_guard_upd` BEFORE UPDATE ON `video` FOR EACH ROW
	WHEN catalog_revision_id() IS NULL
BEGIN
	SELECT RAISE(ABORT, '42501: video is written only through the content write seam: write refused. Write through services/catalog/src/content/write.ts, which records who wrote it and why.');
END;
--> statement-breakpointCREATE TRIGGER `video_write_guard_del` BEFORE DELETE ON `video` FOR EACH ROW
	WHEN catalog_revision_id() IS NULL
BEGIN
	SELECT RAISE(ABORT, '42501: video is written only through the content write seam: write refused. Write through services/catalog/src/content/write.ts, which records who wrote it and why.');
END;
