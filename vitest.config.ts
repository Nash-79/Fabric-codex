import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Standalone vitest config — deliberately NOT the app's vite.config, which loads the TanStack
// Start/Nitro build plugins that unit tests don't need (and that fail outside a full build).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
