-- The product rename in the catalog. 0000 still creates `asset` with a
-- check that names `gnosia`, because that file has already been applied and
-- an edit would leave it pending forever (SCHEMA.md). SQLite bakes a CHECK
-- into CREATE TABLE and will not drop one.
--
-- `legacy_alter_table` keeps a child foreign key pointed at `asset` across
-- the drop, which `PRAGMA foreign_keys = OFF` cannot: that pragma is a no-op
-- inside drizzle's migration transaction. The children are still copied
-- aside and recreated, so a key rewritten onto the dropped table cannot
-- survive the file. The row changes name in a table with no check, because
-- the old check rejects `hermes` and the new one rejects `gnosia`.

PRAGMA legacy_alter_table = ON;
--> statement-breakpoint
CREATE TABLE `asset__copy` AS SELECT * FROM `asset`;
--> statement-breakpoint
UPDATE `asset__copy` SET `source_repo` = 'hermes' WHERE `source_repo` IN ('gnosia', 'self-learn');
--> statement-breakpoint
CREATE TABLE `asset_concept__copy` AS SELECT * FROM `asset_concept`;
--> statement-breakpoint
DROP TABLE `asset_concept`;
--> statement-breakpoint
CREATE TABLE `asset_derivation__copy` AS SELECT * FROM `asset_derivation`;
--> statement-breakpoint
DROP TABLE `asset_derivation`;
--> statement-breakpoint
CREATE TABLE `asset_topic__copy` AS SELECT * FROM `asset_topic`;
--> statement-breakpoint
DROP TABLE `asset_topic`;
--> statement-breakpoint
CREATE TABLE `collection_item__copy` AS SELECT * FROM `collection_item`;
--> statement-breakpoint
DROP TABLE `collection_item`;
--> statement-breakpoint
CREATE TABLE `curriculum_item_asset__copy` AS SELECT * FROM `curriculum_item_asset`;
--> statement-breakpoint
DROP TABLE `curriculum_item_asset`;
--> statement-breakpoint
CREATE TABLE `mirror__copy` AS SELECT * FROM `mirror`;
--> statement-breakpoint
DROP TABLE `mirror`;
--> statement-breakpoint
CREATE TABLE `asset_job__copy` AS SELECT * FROM `asset_job`;
--> statement-breakpoint
DROP TABLE `asset_job`;
--> statement-breakpoint
CREATE TABLE `session__copy` AS SELECT * FROM `session`;
--> statement-breakpoint
-- `event`, `job`, `session_log_entry` and `content_revision` reference
-- `session` with ON DELETE restrict. A drop while those rows exist is refused
-- and the upgrade rolls back. Copy them aside, as the asset children above,
-- and put them back after `session` exists again.
CREATE TABLE `event__copy` AS SELECT * FROM `event`;
--> statement-breakpoint
DROP TABLE `event`;
--> statement-breakpoint
CREATE TABLE `job__copy` AS SELECT * FROM `job`;
--> statement-breakpoint
DROP TABLE `job`;
--> statement-breakpoint
CREATE TABLE `session_log_entry__copy` AS SELECT * FROM `session_log_entry`;
--> statement-breakpoint
DROP TABLE `session_log_entry`;
--> statement-breakpoint
CREATE TABLE `content_revision__copy` AS SELECT * FROM `content_revision`;
--> statement-breakpoint
DROP TABLE `content_revision`;
--> statement-breakpoint
DROP TABLE `session`;
--> statement-breakpoint
DROP TRIGGER `asset_copy_guard_ins`;
--> statement-breakpoint
DROP TRIGGER `asset_copy_guard_upd`;
--> statement-breakpoint
DROP TRIGGER `asset_copy_guard_del`;
--> statement-breakpoint
DROP INDEX `asset_repo_path_key`;
--> statement-breakpoint
DROP INDEX `asset_kind_idx`;
--> statement-breakpoint
DROP INDEX `asset_content_hash_idx`;
--> statement-breakpoint
DROP INDEX `asset_blob_key_idx`;
--> statement-breakpoint
DROP INDEX `asset_owner_id_idx`;
--> statement-breakpoint
DROP TABLE `asset`;
--> statement-breakpoint
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
	CONSTRAINT "asset_source_repo_check" CHECK(source_repo in ('hermes', 'manimkc', 'tldrawkc', 'remotionkc', 'revideokc', 'blenderkc')),
	CONSTRAINT "asset_location_check" CHECK((url is null) = (path is not null or blob_key is not null)),
	CONSTRAINT "asset_stored_blob_check" CHECK(kind not in ('video', 'transcript', 'chapters', 'captions', 'poster', 'pdf', 'diagram_svg') or blob_key is not null),
	CONSTRAINT "asset_bytes_check" CHECK(bytes is null or bytes >= 0),
	CONSTRAINT "asset_resource_type_check" CHECK(resource_type is null or (kind = 'link' and resource_type in ('paper', 'docs', 'video', 'book', 'other', 'practice'))),
	CONSTRAINT "asset_generated_by_check" CHECK(generated_by is null or generated_by in ('manimkc', 'remotionkc', 'revideokc', 'blenderkc', 'tldrawkc', 'video', 'manual'))
);
--> statement-breakpoint
INSERT INTO `asset` SELECT * FROM `asset__copy`;
--> statement-breakpoint
DROP TABLE `asset__copy`;
--> statement-breakpoint
CREATE INDEX `asset_blob_key_idx` ON `asset` (`blob_key`);
--> statement-breakpoint
CREATE INDEX `asset_content_hash_idx` ON `asset` (`content_hash`);
--> statement-breakpoint
CREATE INDEX `asset_kind_idx` ON `asset` (`kind`);
--> statement-breakpoint
CREATE INDEX `asset_owner_id_idx` ON `asset` (`owner_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_repo_path_key` ON `asset` (`source_repo`,`path`);
--> statement-breakpoint
CREATE TRIGGER `asset_copy_guard_del` BEFORE DELETE ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_copy_guard_ins` BEFORE INSERT ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_copy_guard_upd` BEFORE UPDATE ON `asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TABLE `asset_concept` (
	`asset_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `concept_slug`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `asset_concept` SELECT * FROM `asset_concept__copy`;
--> statement-breakpoint
DROP TABLE `asset_concept__copy`;
--> statement-breakpoint
CREATE INDEX `asset_concept_concept_slug_idx` ON `asset_concept` (`concept_slug`);
--> statement-breakpoint
CREATE TRIGGER `asset_concept_copy_guard_ins` BEFORE INSERT ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_concept_copy_guard_upd` BEFORE UPDATE ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_concept_copy_guard_del` BEFORE DELETE ON `asset_concept` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `asset_derivation` SELECT * FROM `asset_derivation__copy`;
--> statement-breakpoint
DROP TABLE `asset_derivation__copy`;
--> statement-breakpoint
CREATE INDEX `asset_derivation_source_asset_id_idx` ON `asset_derivation` (`source_asset_id`);
--> statement-breakpoint
CREATE TRIGGER `asset_derivation_copy_guard_ins` BEFORE INSERT ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_derivation_copy_guard_upd` BEFORE UPDATE ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_derivation_copy_guard_del` BEFORE DELETE ON `asset_derivation` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TABLE `asset_topic` (
	`asset_id` text NOT NULL,
	`topic_slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`asset_id`, `topic_slug`),
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`topic_slug`) REFERENCES `topic`(`slug`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `asset_topic` SELECT * FROM `asset_topic__copy`;
--> statement-breakpoint
DROP TABLE `asset_topic__copy`;
--> statement-breakpoint
CREATE INDEX `asset_topic_topic_slug_idx` ON `asset_topic` (`topic_slug`);
--> statement-breakpoint
CREATE TRIGGER `asset_topic_copy_guard_ins` BEFORE INSERT ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_topic_copy_guard_upd` BEFORE UPDATE ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_topic_copy_guard_del` BEFORE DELETE ON `asset_topic` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `collection_item` SELECT * FROM `collection_item__copy`;
--> statement-breakpoint
DROP TABLE `collection_item__copy`;
--> statement-breakpoint
CREATE INDEX `collection_item_collection_id_idx` ON `collection_item` (`collection_id`);
--> statement-breakpoint
CREATE INDEX `collection_item_topic_slug_idx` ON `collection_item` (`topic_slug`);
--> statement-breakpoint
CREATE INDEX `collection_item_concept_slug_idx` ON `collection_item` (`concept_slug`);
--> statement-breakpoint
CREATE INDEX `collection_item_asset_id_idx` ON `collection_item` (`asset_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_topic_key` ON `collection_item` (`collection_id`,`topic_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_concept_key` ON `collection_item` (`collection_id`,`concept_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_asset_key` ON `collection_item` (`collection_id`,`asset_id`);
--> statement-breakpoint
CREATE TRIGGER `collection_item_copy_guard_ins` BEFORE INSERT ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `collection_item_copy_guard_upd` BEFORE UPDATE ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `collection_item_copy_guard_del` BEFORE DELETE ON `collection_item` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `curriculum_item_asset` SELECT * FROM `curriculum_item_asset__copy`;
--> statement-breakpoint
DROP TABLE `curriculum_item_asset__copy`;
--> statement-breakpoint
CREATE INDEX `curriculum_item_asset_asset_id_idx` ON `curriculum_item_asset` (`asset_id`);
--> statement-breakpoint
CREATE TRIGGER `curriculum_item_asset_copy_guard_ins` BEFORE INSERT ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `curriculum_item_asset_copy_guard_upd` BEFORE UPDATE ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `curriculum_item_asset_copy_guard_del` BEFORE DELETE ON `curriculum_item_asset` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
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
INSERT INTO `mirror` SELECT * FROM `mirror__copy`;
--> statement-breakpoint
DROP TABLE `mirror__copy`;
--> statement-breakpoint
CREATE INDEX `mirror_status_idx` ON `mirror` (`status`);
--> statement-breakpoint
CREATE INDEX `mirror_destination_idx` ON `mirror` (`destination`);
--> statement-breakpoint
CREATE TRIGGER `mirror_copy_guard_ins` BEFORE INSERT ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `mirror_copy_guard_upd` BEFORE UPDATE ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `mirror_copy_guard_del` BEFORE DELETE ON `mirror` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `session` SELECT * FROM `session__copy`;
--> statement-breakpoint
DROP TABLE `session__copy`;
--> statement-breakpoint
CREATE INDEX `session_kind_state_idx` ON `session` (`kind`,`state`);
--> statement-breakpoint
CREATE INDEX `session_started_at_idx` ON `session` (`started_at`);
--> statement-breakpoint
CREATE INDEX `session_learner_id_idx` ON `session` (`learner_id`);
--> statement-breakpoint
CREATE INDEX `session_log_asset_id_idx` ON `session` (`log_asset_id`);
--> statement-breakpoint
CREATE TRIGGER `session_copy_guard_ins` BEFORE INSERT ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `session_copy_guard_upd` BEFORE UPDATE ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `session_copy_guard_del` BEFORE DELETE ON `session` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
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
INSERT INTO `event` SELECT * FROM `event__copy`;
--> statement-breakpoint
DROP TABLE `event__copy`;
--> statement-breakpoint
CREATE INDEX `event_at_idx` ON `event` (`at`);
--> statement-breakpoint
CREATE INDEX `event_learner_id_idx` ON `event` (`learner_id`);
--> statement-breakpoint
CREATE INDEX `event_concept_slug_idx` ON `event` (`concept_slug`);
--> statement-breakpoint
CREATE INDEX `event_session_id_idx` ON `event` (`session_id`);
--> statement-breakpoint
CREATE TRIGGER `event_no_update` BEFORE UPDATE ON `event` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: event is append-only: UPDATE is not allowed');
END;
--> statement-breakpoint
CREATE TRIGGER `event_no_delete` BEFORE DELETE ON `event` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: event is append-only: DELETE is not allowed');
END;
--> statement-breakpoint
CREATE TRIGGER `event_copy_guard_ins` BEFORE INSERT ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `event_copy_guard_upd` BEFORE UPDATE ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `event_copy_guard_del` BEFORE DELETE ON `event` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `job` (`id`, `kind`, `session_id`, `parent_job_id`, `state`, `phase`, `topic_slug`, `target_path`, `candidate_path`, `target_hash_before`, `brief`, `gate`, `idempotency_key`, `attempt`, `requested_at`, `started_at`, `finished_at`, `reviewed_at`, `heartbeat_at`, `cancel_requested_at`, `runner`, `runner_job_id`, `exit_code`, `turns`, `cost_usd`, `cost_source`, `error_kind`, `error`, `error_detail`, `draft_id`, `owner_id`, `created_at`, `updated_at`) SELECT `id`, `kind`, `session_id`, `parent_job_id`, `state`, `phase`, `topic_slug`, `target_path`, `candidate_path`, `target_hash_before`, `brief`, `gate`, `idempotency_key`, `attempt`, `requested_at`, `started_at`, `finished_at`, `reviewed_at`, `heartbeat_at`, `cancel_requested_at`, `runner`, `runner_job_id`, `exit_code`, `turns`, `cost_usd`, `cost_source`, `error_kind`, `error`, `error_detail`, `draft_id`, `owner_id`, `created_at`, `updated_at` FROM `job__copy`;
--> statement-breakpoint
DROP TABLE `job__copy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_key_key` ON `job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_active_target_key` ON `job` (`target_path`) WHERE state in ('queued', 'running', 'awaiting_review');
--> statement-breakpoint
CREATE INDEX `job_session_id_idx` ON `job` (`session_id`);
--> statement-breakpoint
CREATE INDEX `job_state_idx` ON `job` (`state`);
--> statement-breakpoint
CREATE INDEX `job_topic_slug_idx` ON `job` (`topic_slug`);
--> statement-breakpoint
CREATE INDEX `job_parent_job_id_idx` ON `job` (`parent_job_id`);
--> statement-breakpoint
CREATE INDEX `job_requested_at_idx` ON `job` (`requested_at`);
--> statement-breakpoint
CREATE INDEX `job_owner_id_idx` ON `job` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `job_draft_id_idx` ON `job` (`draft_id`);
--> statement-breakpoint
CREATE TRIGGER `job_copy_guard_ins` BEFORE INSERT ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `job_copy_guard_upd` BEFORE UPDATE ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `job_copy_guard_del` BEFORE DELETE ON `job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `asset_job` SELECT * FROM `asset_job__copy`;
--> statement-breakpoint
DROP TABLE `asset_job__copy`;
--> statement-breakpoint
CREATE INDEX `asset_job_job_id_idx` ON `asset_job` (`job_id`);
--> statement-breakpoint
CREATE INDEX `asset_job_owner_id_idx` ON `asset_job` (`owner_id`);
--> statement-breakpoint
CREATE TRIGGER `asset_job_copy_guard_ins` BEFORE INSERT ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_job_copy_guard_upd` BEFORE UPDATE ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_job_copy_guard_del` BEFORE DELETE ON `asset_job` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
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
INSERT INTO `session_log_entry` SELECT * FROM `session_log_entry__copy`;
--> statement-breakpoint
DROP TABLE `session_log_entry__copy`;
--> statement-breakpoint
CREATE TRIGGER `session_log_entry_no_update` BEFORE UPDATE ON `session_log_entry` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: session_log_entry is append-only: UPDATE is not allowed. A session log records what happened. Append a correcting entry, or fix the note it touched.');
END;
--> statement-breakpoint
CREATE TRIGGER `session_log_entry_no_delete` BEFORE DELETE ON `session_log_entry` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: session_log_entry is append-only: DELETE is not allowed. A session log records what happened. Append a correcting entry, or fix the note it touched.');
END;
--> statement-breakpoint
CREATE TRIGGER `session_log_entry_copy_guard_ins` BEFORE INSERT ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `session_log_entry_copy_guard_upd` BEFORE UPDATE ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `session_log_entry_copy_guard_del` BEFORE DELETE ON `session_log_entry` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
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
INSERT INTO `content_revision` SELECT * FROM `content_revision__copy`;
--> statement-breakpoint
DROP TABLE `content_revision__copy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revision_entity_seq_key` ON `content_revision` (`entity_type`,`entity_id`,`seq`);
--> statement-breakpoint
CREATE INDEX `content_revision_owner_id_idx` ON `content_revision` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `content_revision_previous_id_idx` ON `content_revision` (`previous_id`);
--> statement-breakpoint
CREATE INDEX `content_revision_job_id_idx` ON `content_revision` (`job_id`);
--> statement-breakpoint
CREATE INDEX `content_revision_session_id_idx` ON `content_revision` (`session_id`);
--> statement-breakpoint
CREATE INDEX `content_revision_created_at_idx` ON `content_revision` (`created_at`);
--> statement-breakpoint
CREATE TRIGGER `content_revision_no_update` BEFORE UPDATE ON `content_revision` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: content_revision is append-only: UPDATE is not allowed. A revision is history. Write a new revision instead.');
END;
--> statement-breakpoint
CREATE TRIGGER `content_revision_no_delete` BEFORE DELETE ON `content_revision` FOR EACH ROW
BEGIN
	SELECT RAISE(ABORT, '23001: content_revision is append-only: DELETE is not allowed. A revision is history. Write a new revision instead.');
END;
--> statement-breakpoint
CREATE TRIGGER `content_revision_copy_guard_ins` BEFORE INSERT ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `content_revision_copy_guard_upd` BEFORE UPDATE ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `content_revision_copy_guard_del` BEFORE DELETE ON `content_revision` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
