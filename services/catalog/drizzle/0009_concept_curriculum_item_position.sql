-- Teaching order of the concepts on a curriculum item.
--
-- The link used to be written from a note's `topics:` frontmatter, which has
-- no order. It is now declared by `topics[].concepts` in the course file,
-- which does (docs/proposals/course-items-declare-concepts.md). Existing rows
-- get 0 and are rewritten by the next `catalog index`, since every row in
-- this table is derived.
ALTER TABLE "concept_curriculum_item" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;