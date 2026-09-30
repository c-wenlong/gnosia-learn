-- The tutor's model chain (docs/TUTOR-MODELS.md): `tutor_model`, an owner's
-- ordered list of provider and model pairs, tried top to bottom on every
-- tutor turn. No secret: the key each entry calls with is resolved per request.
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block is the copy guard of 0010 (D2, edge case
-- 14), which every table since carries through its own migration, as 0018 did.

CREATE TABLE "tutor_model" (
	"owner_id" text NOT NULL,
	"position" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_model_owner_id_provider_model_pk" PRIMARY KEY("owner_id","provider","model"),
	CONSTRAINT "tutor_model_provider_check" CHECK (provider in ('nvidia', 'gemini', 'openrouter')),
	CONSTRAINT "tutor_model_position_check" CHECK (position between 0 and 9),
	CONSTRAINT "tutor_model_model_check" CHECK (char_length(model) between 1 and 200 and model ~ '^[!-~]+$')
);
--> statement-breakpoint
ALTER TABLE "tutor_model" ADD CONSTRAINT "tutor_model_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_model_owner_position_idx" ON "tutor_model" USING btree ("owner_id","position");
--> statement-breakpoint
CREATE TRIGGER "tutor_model_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "tutor_model" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
