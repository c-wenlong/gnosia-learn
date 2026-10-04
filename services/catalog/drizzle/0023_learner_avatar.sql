-- A pixel sprite per learner (docs/design/BRAND.md, "Avatar sprites"), one of
-- AVATARS in packages/schema/src/shared.ts, chosen on Settings' Profile tab.
--
-- The default draws one at random, so every way a learner row is made gets
-- one without its writer knowing. random() is volatile, so adding the column
-- evaluates the default once per existing row: each existing learner gets its
-- own draw rather than all of them the same sprite.
ALTER TABLE "learner" ADD COLUMN "avatar" text DEFAULT (array['owl', 'cat', 'bookworm', 'fox', 'hedgehog', 'raven', 'frog', 'mouse', 'moth', 'tortoise', 'rabbit', 'bat'])[1 + floor(random() * 12)::int] NOT NULL;--> statement-breakpoint
ALTER TABLE "learner" ADD CONSTRAINT "learner_avatar_check" CHECK (avatar in ('owl', 'cat', 'bookworm', 'fox', 'hedgehog', 'raven', 'frog', 'mouse', 'moth', 'tortoise', 'rabbit', 'bat'));