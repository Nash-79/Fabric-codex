import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything under these paths is proxied to the FastAPI backend, so no CORS config is needed.
const backend = "http://localhost:8000";
const paths = ["/sources", "/claims", "/designs", "/assets", "/tags", "/coverage", "/lessons", "/health", "/content"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: Object.fromEntries(paths.map((p) => [p, { target: backend, changeOrigin: true }])),
  },
});
