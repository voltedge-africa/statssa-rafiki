import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    host: true,
    port: 3005,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
  preview: {
    host: true,
    port: 3005,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
});
