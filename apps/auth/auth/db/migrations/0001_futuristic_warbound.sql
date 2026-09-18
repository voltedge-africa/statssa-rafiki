CREATE TYPE "public"."popia_event_kind" AS ENUM('submitted', 'status_changed', 'assigned', 'note', 'resolution');--> statement-breakpoint
CREATE TYPE "public"."popia_event_visibility" AS ENUM('requester', 'internal');--> statement-breakpoint
CREATE TYPE "public"."popia_request_status" AS ENUM('submitted', 'acknowledged', 'in_review', 'awaiting_information', 'completed', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."popia_request_type" AS ENUM('access', 'correction', 'deletion', 'objection');--> statement-breakpoint
CREATE TABLE "popia_request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "popia_request_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"request_id" text NOT NULL,
	"kind" "popia_event_kind" NOT NULL,
	"visibility" "popia_event_visibility" DEFAULT 'internal' NOT NULL,
	"from_status" "popia_request_status",
	"to_status" "popia_request_status",
	"actor_id" text,
	"actor_label" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popia_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"type" "popia_request_type" NOT NULL,
	"status" "popia_request_status" DEFAULT 'submitted' NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_phone" text,
	"requester_id" text,
	"details" text NOT NULL,
	"desired_outcome" text,
	"resolution" text,
	"assigned_to" text,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "popia_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "popia_request_events" ADD CONSTRAINT "popia_request_events_request_id_popia_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."popia_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "popia_request_events" ADD CONSTRAINT "popia_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "popia_requests" ADD CONSTRAINT "popia_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "popia_requests" ADD CONSTRAINT "popia_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "popia_request_events_request_idx" ON "popia_request_events" USING btree ("request_id","seq");--> statement-breakpoint
CREATE INDEX "popia_requests_status_idx" ON "popia_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "popia_requests_email_idx" ON "popia_requests" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "popia_requests_assigned_idx" ON "popia_requests" USING btree ("assigned_to");