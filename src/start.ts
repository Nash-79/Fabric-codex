import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

let schemaHealthProbed = false;
function probeSchemaHealthOnce() {
  if (schemaHealthProbed) return;
  schemaHealthProbed = true;
  // Fire-and-forget: never block a request. Missing tables/RPCs surface in server logs so
  // deploys announce schema drift without breaking the site.
  import("@/lib/schema-health.server")
    .then(({ getSchemaHealth }) => getSchemaHealth())
    .then((report) => {
      const { ok, warn, fail } = report.summary;
      const level = fail > 0 ? "error" : warn > 0 ? "warn" : "log";
      console[level](
        `[schema-health] ${ok} ok / ${warn} warn / ${fail} fail — latest migration ${
          report.latestMigration?.version ?? "(none)"
        }`,
      );
      if (fail > 0) {
        for (const c of report.checks.filter((c) => c.status === "fail")) {
          console.error(`[schema-health] FAIL ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
        }
      }
    })
    .catch((e) => console.warn("[schema-health] probe skipped:", e?.message ?? e));
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  probeSchemaHealthOnce();
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
