import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vite-plus";

import { controlServerPlugin } from "./server/auth.ts";
import { readServerEnv } from "./server/env.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    controlServerPlugin(readServerEnv(loadEnv(mode, import.meta.dirname, ""))),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 3006,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
  preview: {
    host: true,
    port: 3006,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
}));
