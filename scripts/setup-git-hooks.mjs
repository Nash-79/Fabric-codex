// Runs via the npm "prepare" script on every `npm install`.
// Points git at the versioned .githooks/ directory so the lockfile-sync
// pre-commit hook is active in every clone without manual setup.
import { execSync } from "node:child_process";

try {
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  // Not a git checkout (CI tarball, deploy environment) — nothing to do.
}
