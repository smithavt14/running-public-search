ALTER TABLE "resources" ADD COLUMN "guid" varchar(191);--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_guid_unique" UNIQUE("guid");