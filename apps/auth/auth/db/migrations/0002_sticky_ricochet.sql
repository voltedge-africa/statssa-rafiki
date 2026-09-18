CREATE TYPE "public"."media_event_kind" AS ENUM('submitted', 'status_changed', 'assigned', 'note', 'draft_generated', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_event_visibility" AS ENUM('requester', 'internal');--> statement-breakpoint
CREATE TYPE "public"."media_request_status" AS ENUM('submitted', 'analysing', 'awaiting_review', 'information_gap', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "media_request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "media_request_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"request_id" text NOT NULL,
	"kind" "media_event_kind" NOT NULL,
	"visibility" "media_event_visibility" DEFAULT 'internal' NOT NULL,
	"from_status" "media_request_status",
	"to_status" "media_request_status",
	"actor_id" text,
	"actor_label" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"status" "media_request_status" DEFAULT 'submitted' NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_id" text,
	"outlet" text,
	"claim" text NOT NULL,
	"context" text,
	"deadline" timestamp with time zone,
	"ai_draft" text,
	"ai_sources" jsonb,
	"ai_gap" text,
	"ai_model" text,
	"ai_generated_at" timestamp with time zone,
	"approved_response" text,
	"approved_sources" jsonb,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejected_reason" text,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "media_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "media_request_events" ADD CONSTRAINT "media_request_events_request_id_media_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."media_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_request_events" ADD CONSTRAINT "media_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_requests" ADD CONSTRAINT "media_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_requests" ADD CONSTRAINT "media_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_requests" ADD CONSTRAINT "media_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_request_events_request_idx" ON "media_request_events" USING btree ("request_id","seq");--> statement-breakpoint
CREATE INDEX "media_requests_status_idx" ON "media_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_requests_email_idx" ON "media_requests" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "media_requests_assigned_idx" ON "media_requests" USING btree ("assigned_to");