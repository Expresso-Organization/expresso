import { beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST as createProposal } from "./route";
import { POST as applyProposal } from "./[proposalId]/apply/route";
import { POST as cancelProposal } from "./[proposalId]/cancel/route";
import { POST as rejectProposal } from "./[proposalId]/reject/route";
import { POST as undoProposal } from "./[proposalId]/undo/route";

const recordId = "00000000-0000-4000-8000-000000000001";
const proposalId = "00000000-0000-4000-8000-000000000002";
const recordParams = { params: Promise.resolve({ recordId }) };
const proposalParams = { params: Promise.resolve({ recordId, proposalId }) };

describe("Career AI Proposal MVP BFF gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAccessToken.mockResolvedValue("exps_token");
    vi.stubGlobal("fetch", vi.fn());
  });

  it.each([
    ["create", createProposal, recordParams],
    ["apply", applyProposal, proposalParams],
    ["undo", undoProposal, proposalParams],
    ["reject", rejectProposal, proposalParams],
    ["cancel", cancelProposal, proposalParams],
  ] as const)("blocks %s without calling Fastify", async (_name, handler, context) => {
    const response = await handler(new Request("http://localhost/api/ai", { method: "POST" }), context as never);

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
