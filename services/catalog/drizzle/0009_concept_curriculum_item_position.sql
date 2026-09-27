-- Teaching order of the concepts on a curriculum item.
--
-- The link used to be written from a note's `topics:` frontmatter, which has
-- no order. It is now declared by `topics[].concepts` in the course file,
-- which does (docs/proposals/course-items-declare-concepts.md). Every row is
-- 0 for now: the concepts indexer that writes this table today knows no
-- order, and the authored order arrives when the courses indexer takes the
-- table over in the next slice. Nothing reads the column until then.
ALTER TABLE "concept_curriculum_item" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;