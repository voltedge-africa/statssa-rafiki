import { defineConfig } from "drizzle-kit";
import { orDefault } from "./auth/env.ts";

export default defineConfig({
  schema: "./auth/db/schema.ts",
  out: "./auth/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: orDefault("DATABASE_URL", "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth"),
  },
});
