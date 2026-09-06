const TRANSIENT_DIAGRAM_BROWSER_ERRORS = [
  "Execution context was destroyed",
  "Cannot find context with specified id",
  "Inspected target navigated or closed",
  "Browser target closed before evaluation completed",
];

export function isTransientDiagramBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_DIAGRAM_BROWSER_ERRORS.some((fragment) => message.includes(fragment));
}

export async function retryDiagramBrowserEvaluation<T>(
  run: () => Promise<T>,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientDiagramBrowserError(error)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
