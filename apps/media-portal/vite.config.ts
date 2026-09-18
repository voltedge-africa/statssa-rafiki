import { defineConfig } from "vite-plus";

export default defineConfig({
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
});
