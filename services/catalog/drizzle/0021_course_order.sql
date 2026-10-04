-- Phase 1 of docs/proposals/module-learning-path.md: a course may not teach a
-- concept before a concept it `requires`.
--
-- A concept's place in a course is its first appearance there, ordered by the
-- module's position, the item's position, then the concept's position in the
-- item; only live courses, modules and items count. An edge whose two ends are
-- not both taught by the same course says nothing about that course's order.
-- `assumes` is soft and never refused; `catalog doctor` lists it as a warning.
--
-- Created disabled, like every completeness rule since 0010: `catalog flip
-- courses --strict` arms it once `catalog doctor` reports no violator, and
-- `src/content/rules.ts` names the four triggers so the two cannot drift.
CREATE FUNCTION catalog_check_course_order() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	courses text[];
	offender record;
BEGIN
	IF TG_TABLE_NAME = 'concept_prerequisite' THEN
		IF NEW.kind <> 'requires' THEN
			RETURN NULL;
		END IF;
		SELECT array_agg(DISTINCT m.parent_id) INTO courses
		FROM public.concept_curriculum_item l
		JOIN public.curriculum_item i ON i.id = l.curriculum_item_id
		JOIN public.collection m ON m.id = i.collection_id
		WHERE l.concept_slug IN (NEW.concept_slug, NEW.prerequisite_slug);
	ELSIF TG_TABLE_NAME = 'concept_curriculum_item' THEN
		-- A delete can move a concept's first appearance later, so it is checked too.
		SELECT array_agg(DISTINCT m.parent_id) INTO courses
		FROM public.curriculum_item i
		JOIN public.collection m ON m.id = i.collection_id
		WHERE i.id IN (
			CASE WHEN TG_OP = 'DELETE' THEN OLD.curriculum_item_id ELSE NEW.curriculum_item_id END,
			CASE WHEN TG_OP = 'UPDATE' THEN OLD.curriculum_item_id END
		);
	ELSIF TG_TABLE_NAME = 'curriculum_item' THEN
		-- On a delete the item's links are cascaded away, and their own trigger
		-- finds no item to name the course by; the item's row still does.
		SELECT array_agg(DISTINCT m.parent_id) INTO courses
		FROM public.collection m
		WHERE m.id IN (NEW.collection_id, OLD.collection_id);
	ELSE
		-- A module names its course in parent_id; a course has none and is its own.
		courses := ARRAY[COALESCE(NEW.parent_id, NEW.id), OLD.parent_id];
	END IF;
	IF courses IS NULL THEN
		RETURN NULL;
	END IF;

	WITH taught AS (
		SELECT DISTINCT ON (m.parent_id, l.concept_slug)
			m.parent_id AS course, l.concept_slug AS concept,
			m.position AS module_position, i.position AS item_position, l.position AS link_position
		FROM public.concept_curriculum_item l
		JOIN public.curriculum_item i ON i.id = l.curriculum_item_id AND i.archived_at IS NULL
		JOIN public.collection m ON m.id = i.collection_id AND m.kind = 'module' AND m.archived_at IS NULL
		JOIN public.collection c ON c.id = m.parent_id AND c.archived_at IS NULL
		WHERE m.parent_id = ANY (courses)
		ORDER BY m.parent_id, l.concept_slug, m.position, i.position, l.position
	)
	SELECT a.course, a.concept, b.concept AS prerequisite INTO offender
	FROM public.concept_prerequisite e
	JOIN taught a ON a.concept = e.concept_slug
	JOIN taught b ON b.concept = e.prerequisite_slug AND b.course = a.course
	WHERE e.kind = 'requires'
		AND (b.module_position, b.item_position, b.link_position)
			> (a.module_position, a.item_position, a.link_position)
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'course "%": "%" is taught before "%", which it requires', offender.course, offender.concept, offender.prerequisite
			USING ERRCODE = 'check_violation',
			      HINT = 'Move the prerequisite earlier in the course, or make the edge assumes if the course means to teach it later. catalog doctor lists every violator.';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER concept_prerequisite_course_order
	AFTER INSERT OR UPDATE ON "concept_prerequisite"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_course_order();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER concept_curriculum_item_course_order
	AFTER INSERT OR UPDATE OR DELETE ON "concept_curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_course_order();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER curriculum_item_course_order
	AFTER UPDATE OF position, collection_id, archived_at OR DELETE ON "curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_course_order();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_course_order
	AFTER UPDATE OF position, parent_id, archived_at ON "collection"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_course_order();
--> statement-breakpoint
ALTER TABLE "concept_prerequisite" DISABLE TRIGGER concept_prerequisite_course_order;
--> statement-breakpoint
ALTER TABLE "concept_curriculum_item" DISABLE TRIGGER concept_curriculum_item_course_order;
--> statement-breakpoint
ALTER TABLE "curriculum_item" DISABLE TRIGGER curriculum_item_course_order;
--> statement-breakpoint
ALTER TABLE "collection" DISABLE TRIGGER collection_course_order;
