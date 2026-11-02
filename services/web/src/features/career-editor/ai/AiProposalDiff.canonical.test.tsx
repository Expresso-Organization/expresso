// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiProposalDiff } from "./AiProposalDiff";
const id = "00000000-0000-4000-8000-000000000001";
const base = { proposalId: id, recordId: id, baseDocumentVersion: 0, selection: { blockIds: [] }, summary: "Exact canonical preview", commands: [], createdAt: "2026-10-09T00:00:00Z", expiresAt: "2026-10-10T00:00:00Z" };
afterEach(cleanup);
it("renders canonical-only and canonical-over-legacy changes with exact decimals, date precision and timezone", () => {
  render(<AiProposalDiff proposal={{ ...base, propertyChanges: [
    { propertyId: id, canonicalPreviousValue: { propertyDefinitionId: id, type: "number", value: "123.4500" }, canonicalNextValue: { propertyDefinitionId: id, type: "number", value: "9007199254740993123456789012345678" } },
    { propertyId: "00000000-0000-4000-8000-000000000002", previousValue: { type: "text", value: "rounded legacy" }, nextValue: null,
      canonicalPreviousValue: { propertyDefinitionId: "00000000-0000-4000-8000-000000000002", type: "date", value: { precision: "month", start: "2026-10", end: null, timezone: null } },
      canonicalNextValue: { propertyDefinitionId: "00000000-0000-4000-8000-000000000002", type: "date", value: { precision: "datetime", start: "2026-10-09T09:00:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } } },
  ] } as never} commandIndexes={new Set()} propertyChangeIndexes={new Set([0, 1])} onCommandToggle={vi.fn()} onPropertyToggle={vi.fn()} />);
  expect(screen.getByText("123.4500")).toBeTruthy();
  expect(screen.getByText("9007199254740993123456789012345678")).toBeTruthy();
  expect(screen.getByText("2026-10")).toBeTruthy();
  expect(screen.getByText(/2026-10-09T09:00:00.123456789\+09:00.*Asia\/Seoul/)).toBeTruthy();
  expect(screen.queryByText("rounded legacy")).toBeNull();
});