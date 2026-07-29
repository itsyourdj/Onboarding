import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Emit relative asset URLs (./assets/…) so they resolve against the runtime
  // <base href> the backend injects — lets one build run under any mount path.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
