import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AiEditProposalDetailSchema, AiProposalUndoResponseSchema, AiEditProposalSchema } from "./career-ai.js";
const id = randomUUID(), now = "2026-10-09T00:00:00Z";
const detail = { proposalId: id, recordId: id, baseDocumentVersion: 0, selection: { blockIds: [] }, summary: "Business only", commands: [], propertyChanges: [], createdAt: now, expiresAt: now, status: "applied", progress: null, appliedDocumentVersion: null, revisionId: null };
describe("AI applied Undo capability", () => {
  it("preserves old detail fixtures and adds explicit none/document capability", () => {
    expect(AiEditProposalDetailSchema.parse(detail)).toEqual(detail);
    expect(AiEditProposalDetailSchema.parse({ ...detail, undoScope: "none", businessChangesRetained: true })).toMatchObject({ undoScope: "none", businessChangesRetained: true });
    expect(AiEditProposalDetailSchema.parse({ ...detail, undoScope: "document", businessChangesRetained: true })).toMatchObject({ undoScope: "document" });
  });
  it("accepts an explicit no-target outcome without inventing a document restore", () => {
    expect(AiProposalUndoResponseSchema.parse({ data: { outcome: "no-document-target", scope: "none", businessChangesRetained: true } })).toEqual({ data: { outcome: "no-document-target", scope: "none", businessChangesRetained: true } });
    expect(AiProposalUndoResponseSchema.safeParse({ data: { outcome: "no-document-target", scope: "none", businessChangesRetained: false } }).success).toBe(false);
  });
  it("retains old direct and wrapped document restore responses", () => {
    const bootstrap = { record: { id, categoryId: id, title: "", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: now }, document: { schemaVersion: 1, type: "doc", content: [] }, snapshotVersion: 0, documentVersion: 1, stateVectorBase64: "", pendingUpdateCount: 0, sessionToken: "s".repeat(32) };
    expect(AiProposalUndoResponseSchema.parse(bootstrap)).toEqual(bootstrap);
    expect(AiProposalUndoResponseSchema.parse({ data: bootstrap })).toEqual({ data: bootstrap });
  });
});
describe("AI exact canonical selected changes", () => {
  const propertyId=randomUUID(), other=randomUUID();
  const previous={propertyDefinitionId:propertyId,type:"number",value:"12345678901234567890.123400"};
  const next={...previous,value:"12345678901234567890.123500"};
  it("accepts exact canonical pairs without rounded legacy placeholders",()=>{
    expect(AiEditProposalSchema.shape.propertyChanges.parse([{propertyId,canonicalPreviousValue:previous,canonicalNextValue:next}])).toEqual([{propertyId,canonicalPreviousValue:previous,canonicalNextValue:next}]);
    const month={propertyDefinitionId:propertyId,type:"date",value:{precision:"month",start:"2026-01",end:"2026-02"}};
    expect(AiEditProposalSchema.shape.propertyChanges.parse([{propertyId,canonicalPreviousValue:month,canonicalNextValue:null}])[0]).toHaveProperty("canonicalPreviousValue",month);
  });
  it("keeps legacy payloads and validates paired canonical fields and stable IDs",()=>{
    expect(AiEditProposalSchema.shape.propertyChanges.parse([{propertyId,previousValue:{type:"number",value:1},nextValue:{type:"number",value:2}}])).toHaveLength(1);
    for(const change of [{propertyId,canonicalPreviousValue:previous},{propertyId,canonicalPreviousValue:previous,canonicalNextValue:{...next,propertyDefinitionId:other}},{propertyId,previousValue:null,nextValue:null,canonicalPreviousValue:previous}])expect(AiEditProposalSchema.shape.propertyChanges.safeParse([change]).success).toBe(false);
  });
});