// Captures the original Error + request info out-of-band so server.ts can
// recover diagnostic detail when h3 has already swallowed the throw into a
// generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
let lastCapturedRequest: { method: string; url: string; pathname: string; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

export function recordRequest(request: Request) {
  try {
    const url = new URL(request.url);
    lastCapturedRequest = {
      method: request.method,
      url: request.url,
      pathname: url.pathname,
      at: Date.now(),
    };
  } catch {
    /* ignore */
  }
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

export function peekLastCapturedRequest() {
  if (!lastCapturedRequest) return undefined;
  if (Date.now() - lastCapturedRequest.at > TTL_MS) {
    lastCapturedRequest = undefined;
    return undefined;
  }
  return lastCapturedRequest;
}
