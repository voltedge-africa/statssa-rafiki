import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    host: true,
    allowedHosts: [".ts.net"],
  },
});
