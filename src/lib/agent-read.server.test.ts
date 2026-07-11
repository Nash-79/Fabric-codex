import { afterEach, describe, expect, it } from "vitest";
import { authorizeAgentRead } from "./agent-read.server";

const original = process.env.FABRIC_ATLAS_AGENT_READ_TOKEN;

afterEach(() => {
  if (original === undefined) delete process.env.FABRIC_ATLAS_AGENT_READ_TOKEN;
  else process.env.FABRIC_ATLAS_AGENT_READ_TOKEN = original;
});

describe("agent read authorization", () => {
  it("rejects missing configuration and missing or incorrect bearer tokens", () => {
    delete process.env.FABRIC_ATLAS_AGENT_READ_TOKEN;
    expect(authorizeAgentRead(new Request("https://atlas.test/api/agent/state"))).toBe(false);

    process.env.FABRIC_ATLAS_AGENT_READ_TOKEN = "correct-secret";
    expect(authorizeAgentRead(new Request("https://atlas.test/api/agent/state"))).toBe(false);
    expect(
      authorizeAgentRead(
        new Request("https://atlas.test/api/agent/state", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
    ).toBe(false);
  });

  it("accepts only the configured bearer token", () => {
    process.env.FABRIC_ATLAS_AGENT_READ_TOKEN = "correct-secret";
    expect(
      authorizeAgentRead(
        new Request("https://atlas.test/api/agent/state", {
          headers: { authorization: "Bearer correct-secret" },
        }),
      ),
    ).toBe(true);
  });
});
