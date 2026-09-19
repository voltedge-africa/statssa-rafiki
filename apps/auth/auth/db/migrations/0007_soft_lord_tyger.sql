CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."brief_verification_status" AS ENUM('verified', 'unverified', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."gap_label_source" AS ENUM('auto', 'model');--> statement-breakpoint
CREATE TYPE "public"."gap_surface" AS ENUM('chat', 'media_draft');--> statement-breakpoint
CREATE TABLE "analysis_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"sources" jsonb NOT NULL,
	"focus" text,
	"content" jsonb,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" "brief_verification_status" DEFAULT 'skipped' NOT NULL,
	"unverified_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" text,
	"created_by" text,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"label_source" "gap_label_source" DEFAULT 'auto' NOT NULL,
	"centroid" vector(384),
	"query_count" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text,
	"surface" "gap_surface" NOT NULL,
	"query" text NOT NULL,
	"reference" text,
	"outlet" text,
	"role" text,
	"origin" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_briefs" ADD CONSTRAINT "analysis_briefs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_queries" ADD CONSTRAINT "gap_queries_category_id_gap_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gap_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_briefs_created_idx" ON "analysis_briefs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gap_queries_created_idx" ON "gap_queries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gap_queries_category_idx" ON "gap_queries" USING btree ("category_id");