ALTER TABLE "collection" ADD COLUMN "cover_blob_key" text;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_cover_blob_key_blob_object_key_fk" FOREIGN KEY ("cover_blob_key") REFERENCES "public"."blob_object"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "collection_cover_blob_key_idx" ON "collection" USING btree ("cover_blob_key");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_cover_course_check" CHECK (cover_blob_key is null or kind = 'course');--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_cover_credit_check" CHECK ((cover_blob_key is null) = ((metadata -> 'coverCredit') is null));