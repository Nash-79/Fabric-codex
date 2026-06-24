import "./lib/error-capture";

import {
  consumeLastCapturedError,
  peekLastCapturedRequest,
  recordRequest,
} from "./lib/error-capture";
import { renderErrorPage, renderDevErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

async function buildErrorResponse(error: unknown): Promise<Response> {
  if (isDev) {
    try {
      const { readRecentLogs } = await import("./lib/dev-logs.server");
      const logs = await readRecentLogs(120);
      const req = peekLastCapturedRequest();
      return new Response(
        renderDevErrorPage({
          request: req ? { method: req.method, pathname: req.pathname } : undefined,
          error,
          logs,
        }),
        { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    } catch (e) {
      console.error("Failed to render dev error page", e);
    }
  }
  return new Response(renderErrorPage(error), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  const err = captured ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(err);
  return buildErrorResponse(err);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    recordRequest(request);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return buildErrorResponse(error);
    }
  },
};
