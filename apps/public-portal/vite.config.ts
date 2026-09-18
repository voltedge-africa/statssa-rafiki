import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 3003,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
  preview: {
    host: true,
    port: 3003,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
});
