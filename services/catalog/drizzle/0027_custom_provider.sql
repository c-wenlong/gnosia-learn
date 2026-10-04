CREATE TABLE "custom_provider" (
	"owner_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_provider_owner_id_id_pk" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "custom_provider_id_check" CHECK (id ~ '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
	CONSTRAINT "custom_provider_label_check" CHECK (char_length(label) between 1 and 60),
	CONSTRAINT "custom_provider_base_url_check" CHECK (char_length(base_url) between 1 and 300 and (base_url ~ '^https://' or base_url ~ '^http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]+)?(/|$)'))
);
--> statement-breakpoint
ALTER TABLE "provider_key" DROP CONSTRAINT "provider_key_provider_check";--> statement-breakpoint
ALTER TABLE "tutor_model" DROP CONSTRAINT "tutor_model_provider_check";--> statement-breakpoint
ALTER TABLE "custom_provider" ADD CONSTRAINT "custom_provider_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "provider_key" ADD CONSTRAINT "provider_key_provider_check" CHECK ((provider in ('nvidia', 'gemini', 'openrouter', 'openai', 'anthropic', 'deepseek', 'glm', 'qwen', 'moonshot', 'minimax', 'mimo', 'mistral', 'groq', 'xai') or provider ~ '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'));--> statement-breakpoint
ALTER TABLE "tutor_model" ADD CONSTRAINT "tutor_model_provider_check" CHECK ((provider in ('nvidia', 'gemini', 'openrouter', 'openai', 'anthropic', 'deepseek', 'glm', 'qwen', 'moonshot', 'minimax', 'mimo', 'mistral', 'groq', 'xai') or provider ~ '^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'));--> statement-breakpoint
-- Every table but catalog_instance refuses writes on a copy (0010), and a
-- table added later takes the guard in the migration that adds it.
CREATE TRIGGER "custom_provider_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "custom_provider" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
