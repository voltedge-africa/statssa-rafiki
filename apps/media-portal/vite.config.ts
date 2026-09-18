import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vite-plus";

import { mediaServerPlugin } from "./server/auth.ts";
import { readServerEnv } from "./server/env.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    mediaServerPlugin(readServerEnv(loadEnv(mode, import.meta.dirname, ""))),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 3004,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
  preview: {
    host: true,
    port: 3004,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
}));
