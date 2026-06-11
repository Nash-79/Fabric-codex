import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything under these paths is proxied to the FastAPI backend, so no CORS config is needed.
// Several SPA routes (/sources, /topics, /search, …) share their path with a JSON API route;
// the bypass keeps browser navigations (Accept: text/html) in the SPA while fetch() calls
// (Accept: */*) proxy through to the backend.
const backend = "http://localhost:8000";
const paths = ["/sources", "/claims", "/designs", "/assets", "/tags", "/coverage", "/lessons",
  "/health", "/content", "/queue", "/topics", "/blogs", "/search", "/help"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: Object.fromEntries(paths.map((p) => [p, {
      target: backend,
      changeOrigin: true,
      bypass: (req) => (req.headers.accept || "").includes("text/html") ? "/index.html" : undefined,
    }])),
  },
});
