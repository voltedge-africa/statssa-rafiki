CREATE TABLE "ai_spans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_spans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"span_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parent_uid" uuid,
	"session_id" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"feature" text,
	"client_role" text,
	"client_origin" text,
	"provider" text,
	"model" text,
	"response_model" text,
	"operation" text,
	"tool_name" text,
	"tool_call_id" text,
	"tool_is_error" boolean,
	"stop_reason" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"error_message" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"reasoning_tokens" integer,
	"total_tokens" integer,
	"cost_usd" numeric(14, 6),
	"chunk_count" integer,
	"time_to_first_chunk_ms" integer,
	"duration_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_spans_span_uid_unique" UNIQUE("span_uid")
);
--> statement-breakpoint
CREATE INDEX "ai_spans_session_idx" ON "ai_spans" USING btree ("session_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_kind_idx" ON "ai_spans" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_name_idx" ON "ai_spans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ai_spans_model_idx" ON "ai_spans" USING btree ("model","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_tool_idx" ON "ai_spans" USING btree ("tool_name","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_feature_idx" ON "ai_spans" USING btree ("feature","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_role_idx" ON "ai_spans" USING btree ("client_role","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_status_idx" ON "ai_spans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_spans_created_idx" ON "ai_spans" USING btree ("created_at");--> statement-breakpoint
CREATE VIEW "public"."ai_model_usage" AS (select "span_uid", "parent_uid", "session_id", "feature", "client_role", "client_origin", "provider", "model", "response_model", "operation", "stop_reason", "status", "error_message", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens", "cost_usd", "chunk_count", "time_to_first_chunk_ms", "duration_ms", "started_at", "ended_at" from "ai_spans" where "ai_spans"."kind" = 'model_request');--> statement-breakpoint
CREATE VIEW "public"."ai_tool_usage" AS (select "span_uid", "parent_uid", "session_id", "feature", "client_role", "tool_name", "tool_call_id", "tool_is_error", "status", "error_message", "duration_ms", "started_at", "ended_at" from "ai_spans" where "ai_spans"."kind" = 'tool');