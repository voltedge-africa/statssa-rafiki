import { defineConfig } from "vite-plus";
import { authServerPlugin } from "./server/auth.ts";

export default defineConfig({
  plugins: [authServerPlugin()],
  server: {
    host: true,
    allowedHosts: [".ts.net"],
  },
});
