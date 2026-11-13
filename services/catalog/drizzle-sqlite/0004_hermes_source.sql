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
