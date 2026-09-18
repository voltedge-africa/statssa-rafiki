import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vite-plus";

import { authServerPlugin } from "./server/auth.ts";
import { readServerEnv } from "./server/env.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    authServerPlugin(readServerEnv(loadEnv(mode, import.meta.dirname, ""))),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../packages/ui/src"),
    },
  },
  server: {
    host: true,
    allowedHosts: [".ts.net"],
  },
}));
