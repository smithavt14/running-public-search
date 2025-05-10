ALTER TABLE "resources" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "pub_date" timestamp;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "enclosure_url" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "duration" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "episode_number" varchar(20);