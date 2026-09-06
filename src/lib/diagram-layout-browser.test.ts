import { describe, expect, it, vi } from "vitest";

import {
  isTransientDiagramBrowserError,
  retryDiagramBrowserEvaluation,
} from "./diagram-layout-browser";

describe("isTransientDiagramBrowserError", () => {
  it("recognizes execution context resets from headless Chromium", () => {
    expect(
      isTransientDiagramBrowserError(
        new Error("Browser evaluation failed: Execution context was destroyed."),
      ),
    ).toBe(true);
  });

  it("ignores unrelated browser errors", () => {
    expect(
      isTransientDiagramBrowserError(new Error("Browser returned no evaluation result.")),
    ).toBe(false);
  });
});

describe("retryDiagramBrowserEvaluation", () => {
  it("retries transient browser evaluation errors and returns the later success", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error("Browser evaluation failed: Execution context was destroyed."),
      )
      .mockResolvedValueOnce("ok");

    await expect(retryDiagramBrowserEvaluation(run, { attempts: 2, delayMs: 0 })).resolves.toBe(
      "ok",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient browser failures", async () => {
    const error = new Error("Browser connection failed.");
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(retryDiagramBrowserEvaluation(run, { attempts: 3, delayMs: 0 })).rejects.toBe(
      error,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
