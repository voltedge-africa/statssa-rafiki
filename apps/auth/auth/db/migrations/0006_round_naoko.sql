CREATE TABLE "governance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"confidence_min" numeric(3, 2) DEFAULT '0.85' NOT NULL,
	"generation_enabled" boolean DEFAULT true NOT NULL,
	"enabled_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incident_response" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
