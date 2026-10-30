// @vitest-environment jsdom
import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import type { AiPromptRequest } from "../ai/AiProposalPanel";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const requestBoundary = vi.hoisted(() => ({ current: null as AiPromptRequest | null, callbacks: new Map<string, () => void>(), completed: 0 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(app)/career/[categorySlug]/DocumentPanel", () => ({ DocumentPanel: ({ aiRequest, onAiRequestHandled }: { aiRequest: AiPromptRequest | null; onAiRequestHandled: () => void }) => { requestBoundary.current = aiRequest; if (aiRequest) requestBoundary.callbacks.set(aiRequest.id, onAiRequestHandled); return null; } }));
vi.mock("./AiRecordInterview", () => ({ AiRecordInterview: ({ onComplete }: { onComplete: (result: { title: string; bodyMd: string; prompt: string }) => void }) => <button onClick={() => { const key = ++requestBoundary.completed === 1 ? "A" : "B"; onComplete({ title: key, bodyMd: key, prompt: key }); }}>대화 완료</button> }));
import { CareerViewShell } from "./CareerViewShell";

const categoryId = "00000000-0000-4000-8000-000000000001", updatedAt = "2026-10-09T00:00:00Z";
const category: CareerCategory = { id: categoryId, key: "test", name: "테스트", icon: "table", defaultView: "table", propertySchemaV2: [], sortOrder: 0, recordCount: 0, version: 1 };
const view: CareerViewConfiguration = { id: "local-" + categoryId, categoryId, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [], propertyOrder: [], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: updatedAt, updatedAt };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); requestBoundary.current = null; requestBoundary.callbacks.clear(); requestBoundary.completed = 0; });

it("keeps queued parent request B when captured request A completion arrives", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const record: CareerRecord = { id: body.title === "A" ? "00000000-0000-4000-8000-000000000002" : "00000000-0000-4000-8000-000000000003", categoryId, title: body.title, bodyMd: body.bodyMd, status: "draft", origin: "manual", properties: {}, propertyValues: [], version: 1, updatedAt };
    return Response.json({ data: record });
  }));
  render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [], page: { hasNextPage: false, nextCursor: null } }} />);
  fireEvent.click(screen.getByRole("button", { name: "AI로 만들기" })); fireEvent.click(screen.getByRole("button", { name: "대화 완료" }));
  await waitFor(() => expect(requestBoundary.current?.prompt).toBe("A"));
  const requestAId = requestBoundary.current!.id, completeA = requestBoundary.callbacks.get(requestAId)!;
  fireEvent.click(screen.getByRole("button", { name: "AI로 만들기" })); fireEvent.click(screen.getByRole("button", { name: "대화 완료" }));
  await waitFor(() => expect(requestBoundary.current?.prompt).toBe("B"));
  const requestBId = requestBoundary.current!.id;
  act(() => completeA());
  expect(requestBoundary.current?.id).toBe(requestBId);
  act(() => requestBoundary.callbacks.get(requestBId)!());
  expect(requestBoundary.current).toBeNull();
});