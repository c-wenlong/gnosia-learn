-- Bring your own key (docs/BYOK.md): `provider_key`, an owner's own model
-- provider API keys, each AES-256-GCM encrypted under a key derived from
-- AUTH_SECRET. The database holds ciphertext, the nonce, the tag, the
-- derivation's version and the last four characters, never a key.
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block is the copy guard of 0010 (D2, edge case
-- 14): a table added after it carries none unless its own migration adds it,
-- and services/catalog/test/content-seam.test.ts checks every table but
-- `catalog_instance` has one.

CREATE TABLE "provider_key" (
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"key_version" integer NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_key_owner_id_provider_pk" PRIMARY KEY("owner_id","provider"),
	CONSTRAINT "provider_key_provider_check" CHECK (provider in ('nvidia', 'gemini', 'openrouter')),
	CONSTRAINT "provider_key_iv_check" CHECK (octet_length(iv) = 12),
	CONSTRAINT "provider_key_auth_tag_check" CHECK (octet_length(auth_tag) = 16),
	CONSTRAINT "provider_key_ciphertext_check" CHECK (octet_length(ciphertext) between 1 and 2048),
	CONSTRAINT "provider_key_key_version_check" CHECK (key_version >= 1),
	CONSTRAINT "provider_key_last4_check" CHECK (char_length(last4) = 4)
);
--> statement-breakpoint
ALTER TABLE "provider_key" ADD CONSTRAINT "provider_key_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE TRIGGER "provider_key_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "provider_key" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
