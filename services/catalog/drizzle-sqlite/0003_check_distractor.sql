-- The tutor's wrong options per note check (docs/LEARN.md, "Wrong options"):
-- `check_distractor`, one row per learner, concept and check id, replaced when
-- the check's hash changes. A cache: losing it costs one model call per check.
--
-- drizzle-kit's own output is everything between this header and the block at
-- the end, unedited. The block is the copy guard every table carries, as three
-- row triggers (test/content-seam.test.ts fails a table without them).
CREATE TABLE `check_distractor` (
	`learner_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`check_id` text NOT NULL,
	`check_hash` text NOT NULL,
	`options` text NOT NULL,
	`model` text,
	`provider` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `concept_slug`, `check_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`concept_slug`) REFERENCES `concept`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "check_distractor_check_id_check" CHECK(check_id regexp '^c[1-9][0-9]{0,3}$'),
	CONSTRAINT "check_distractor_check_hash_check" CHECK(check_hash regexp '^[0-9a-f]{64}$'),
	CONSTRAINT "check_distractor_options_check" CHECK(json_valid(options) and json_type(options) = 'array' and json_array_length(options) = 3 and length(options) <= 2424)
);
--> statement-breakpoint
CREATE INDEX `check_distractor_concept_slug_idx` ON `check_distractor` (`concept_slug`);
--> statement-breakpoint
CREATE TRIGGER `check_distractor_copy_guard_ins` BEFORE INSERT ON `check_distractor` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `check_distractor_copy_guard_upd` BEFORE UPDATE ON `check_distractor` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
--> statement-breakpoint
CREATE TRIGGER `check_distractor_copy_guard_del` BEFORE DELETE ON `check_distractor` FOR EACH ROW
	WHEN catalog_copy_ok() = 0 AND (SELECT `role` FROM `catalog_instance` WHERE `id`) = 'copy'
BEGIN
	SELECT RAISE(ABORT, '25006: this database is a copy, so writes are refused. Writes go to the primary (' || (select primary_host from catalog_instance where id) || ').');
END;
