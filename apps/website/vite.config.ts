import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { authServerPlugin } from "./server/auth.ts";

export default defineConfig({
  plugins: [authServerPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../packages/ui/src"),
    },
  },
  server: {
    host: true,
    allowedHosts: [".ts.net"],
  },
});
