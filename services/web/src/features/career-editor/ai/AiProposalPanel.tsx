"use client";

import type { AiEditProposal, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerDocument } from "@expresso/editor";
import { useEffect, useRef, useState } from "react";

import { AiProposalDiff } from "./AiProposalDiff";
import styles from "./ai.module.css";

export type AiProposalStatus = "draft" | "streaming" | "ready" | "applied" | "rejected" | "cancelled" | "expired" | "conflicted";
export interface AiPromptRequest { id: string; recordId: string; prompt: string; displayPrompt?: string; blockIds?: string[] }
export interface AiProposalView extends AiEditProposal { status?: AiProposalStatus; progress?: { phase: "preparing" | "generating" | "validating"; completed: number; total?: number | undefined } | null; appliedDocumentVersion?: number | null; revisionId?: string | null }
export interface AiProposalClient {
  create(recordId: string, input: { prompt: string; selection: { blockIds: string[] } }): Promise<AiProposalView>;
  get(recordId: string, proposalId: string): Promise<AiProposalView>;
  apply(recordId: string, proposalId: string, input: { expectedDocumentVersion: number; commandIndexes: number[]; propertyChangeIndexes: number[] }): Promise<AiProposalView>;
  reject(recordId: string, proposalId: string): Promise<void>;
  cancel(recordId: string, proposalId: string): Promise<void>;
  undo(recordId: string, proposalId: string, expectedDocumentVersion: number): Promise<void>;
}

const QUICK_PROMPTS = ["성과를 더 구체적으로", "문장 다듬기", "이 경험에서 스킬 찾기"];

async function data<T>(response: Response): Promise<T> {
  if (!response.ok) { const error = new Error(response.status === 409 || response.status === 412 ? "사람의 편집 내용과 충돌했습니다." : "AI 제안 요청을 처리하지 못했습니다."); (error as Error & { status?: number }).status = response.status; throw error; }
  const body = await response.json() as { data: T };
  return body.data;
}
async function action(response: Response): Promise<void> {
  if (!response.ok) { const error = new Error(response.status === 409 || response.status === 412 ? "사람의 편집 내용과 충돌했습니다." : "AI 제안 요청을 처리하지 못했습니다."); (error as Error & { status?: number }).status = response.status; throw error; }
}
const defaultClient: AiProposalClient = {
  create: async (recordId, input) => data(await fetch(`/api/career/records/${recordId}/ai-proposals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })),
  get: async (recordId, proposalId) => data(await fetch(`/api/career/records/${recordId}/ai-proposals/${proposalId}`, { cache: "no-store" })),
  apply: async (recordId, proposalId, input) => data(await fetch(`/api/career/records/${recordId}/ai-proposals/${proposalId}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })),
  reject: async (recordId, proposalId) => action(await fetch(`/api/career/records/${recordId}/ai-proposals/${proposalId}/reject`, { method: "POST" })),
  cancel: async (recordId, proposalId) => action(await fetch(`/api/career/records/${recordId}/ai-proposals/${proposalId}/cancel`, { method: "POST" })),
  undo: async (recordId, proposalId, expectedDocumentVersion) => { await data(await fetch(`/api/career/records/${recordId}/ai-proposals/${proposalId}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedDocumentVersion }) })); },
};

export function AiProposalPanel({ recordId, documentVersion, selectedBlockIds = [], announcedProposal, requestedPrompt, document: currentDocument, definitions = [], client = defaultClient, onApplied, onRequestHandled }: {
  recordId: string;
  documentVersion: number;
  selectedBlockIds?: readonly string[];
  announcedProposal?: { proposalId: string; baseDocumentVersion: number; status?: AiProposalStatus; progress?: AiProposalView["progress"] | null } | null;
  requestedPrompt?: AiPromptRequest | null | undefined;
  document?: CareerDocument | null | undefined;
  definitions?: readonly CareerPropertyDefinitionV2[];
  client?: AiProposalClient;
  onApplied?: (() => void) | undefined;
  onRequestHandled?: (() => void) | undefined;
}) {
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<AiProposalView | null>(null);
  const [status, setStatus] = useState<AiProposalStatus>("draft");
  const [commandIndexes, setCommandIndexes] = useState<Set<number>>(new Set());
  const [propertyIndexes, setPropertyIndexes] = useState<Set<number>>(new Set());
  const [issue, setIssue] = useState<string | null>(null);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const handledRequest = useRef<string | null>(null);

  function rememberFocus() { returnFocus.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null; }
  function rememberFocusIfMissing() { if (!returnFocus.current) rememberFocus(); }
  function restoreFocus() { const target = returnFocus.current; returnFocus.current = null; queueMicrotask(() => target?.focus()); }
  function selectAll(next: AiProposalView) { setCommandIndexes(new Set(next.commands.map((_, index) => index))); setPropertyIndexes(new Set(next.propertyChanges.map((_, index) => index))); }

  useEffect(() => {
    if (!announcedProposal) return;
    if (proposal?.proposalId === announcedProposal.proposalId) {
      setStatus(announcedProposal.status ?? proposal.status ?? "ready");
      setProposal((current) => current ? { ...current, ...(announcedProposal.status ? { status: announcedProposal.status } : {}), ...(announcedProposal.progress !== undefined ? { progress: announcedProposal.progress } : {}) } : current);
      return;
    }
    let active = true;
    void client.get(recordId, announcedProposal.proposalId).then((next) => { if (!active) return; setProposal(next); setStatus(next.status ?? "ready"); selectAll(next); }).catch(() => { if (active) setIssue("제안을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [announcedProposal, client, proposal?.proposalId, recordId]);

  useEffect(() => {
    const requestedBlockIds = requestedPrompt?.blockIds?.length ? requestedPrompt.blockIds : selectedBlockIds;
    if (!requestedPrompt || requestedPrompt.recordId !== recordId || handledRequest.current === requestedPrompt.id || requestedBlockIds.length === 0 || status === "streaming") return;
    handledRequest.current = requestedPrompt.id;
    setPrompt(requestedPrompt.displayPrompt ?? requestedPrompt.prompt);
    void create(requestedPrompt.prompt, requestedBlockIds).finally(() => onRequestHandled?.());
  }, [onRequestHandled, recordId, requestedPrompt, selectedBlockIds, status]);

  async function create(nextPrompt = prompt, blockIds: readonly string[] = selectedBlockIds) {
    if (!nextPrompt.trim()) return;
    setIssue(null); setStatus("streaming"); rememberFocusIfMissing();
    try { const next = await client.create(recordId, { prompt: nextPrompt.trim(), selection: { blockIds: [...blockIds] } }); setProposal(next); setStatus(next.status ?? "ready"); selectAll(next); }
    catch (error) { setStatus("draft"); setIssue(error instanceof Error ? error.message : "제안을 만들지 못했습니다."); }
    finally { restoreFocus(); }
  }

  async function apply() {
    if (!proposal) return;
    setIssue(null); rememberFocusIfMissing();
    try { const applied = await client.apply(recordId, proposal.proposalId, { expectedDocumentVersion: documentVersion, commandIndexes: [...commandIndexes].sort((a, b) => a - b), propertyChangeIndexes: [...propertyIndexes].sort((a, b) => a - b) }); setProposal(applied); setStatus(applied.status ?? "applied"); onApplied?.(); }
    catch (error) { setStatus("conflicted"); setIssue(error instanceof Error ? error.message : "제안을 적용하지 못했습니다."); }
    finally { restoreFocus(); }
  }

  async function reject() { if (!proposal) return; setIssue(null); try { await client.reject(recordId, proposal.proposalId); setStatus("rejected"); } catch (error) { setIssue(error instanceof Error ? error.message : "제안을 거절하지 못했습니다."); } }
  async function cancel() { if (!proposal) return; setIssue(null); try { await client.cancel(recordId, proposal.proposalId); setStatus("cancelled"); } catch (error) { setIssue(error instanceof Error ? error.message : "제안 생성을 취소하지 못했습니다."); } }
  async function undo() { if (!proposal) return; if (!undoConfirm) { setUndoConfirm(true); return; } setIssue(null); try { await client.undo(recordId, proposal.proposalId, proposal.appliedDocumentVersion ?? documentVersion); setUndoConfirm(false); setStatus("ready"); onApplied?.(); } catch (error) { setIssue(error instanceof Error ? error.message : "변경을 되돌리지 못했습니다."); } }
  const phase = proposal?.progress?.phase === "preparing" ? "문맥 준비 중" : proposal?.progress?.phase === "validating" ? "변경 검증 중" : "제안 작성 중";
  const selectedCount = commandIndexes.size + propertyIndexes.size;

  return <section className={styles.panel} aria-label="Expresso AI 편집 제안">
    <header><span className={styles.aiMark} aria-hidden="true">✦</span><div><strong>Expresso AI</strong><small>변경 내용을 확인한 뒤 적용합니다.</small></div></header>
    <div className={styles.quickActions}>{QUICK_PROMPTS.map((item) => <button key={item} type="button" disabled={selectedBlockIds.length === 0 || status === "streaming"} onPointerDown={rememberFocus} onClick={() => { setPrompt(item); void create(item); }}>{item}</button>)}</div>
    <div className={styles.composer}><textarea aria-label="AI에게 편집 요청" value={prompt} maxLength={4_000} placeholder="이 경험을 어떻게 다듬을까요?" onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void create(); } }} /><button type="button" onPointerDown={rememberFocus} disabled={!prompt.trim() || selectedBlockIds.length === 0 || status === "streaming"} onClick={() => void create()}>제안 만들기</button></div>
    {status === "streaming" ? <div className={styles.progress} role="status"><span className={styles.spinner} aria-hidden="true" />{phase}{proposal?.progress?.total ? ` ${proposal.progress.completed}/${proposal.progress.total}` : ""}<button type="button" onClick={() => void cancel()}>취소</button></div> : null}
    {proposal && ["ready", "conflicted", "applied"].includes(status) ? <div className={styles.review}><div className={styles.reviewHeading}><div><strong>{proposal.summary}</strong><small>본문 {proposal.commands.length}건 · 속성 {proposal.propertyChanges.length}건</small></div><span>{selectedCount}개 선택</span></div><AiProposalDiff proposal={proposal} document={currentDocument ?? null} definitions={definitions} commandIndexes={commandIndexes} propertyChangeIndexes={propertyIndexes} onCommandToggle={(index) => setCommandIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} onPropertyToggle={(index) => setPropertyIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} /><div className={styles.reviewActions}>{status === "applied" ? <button type="button" onClick={() => void undo()}>{undoConfirm ? "되돌리기 확인" : "변경 되돌리기"}</button> : <><button type="button" onClick={() => void reject()}>거절</button><button type="button" disabled={selectedCount === 0} onPointerDown={rememberFocus} onClick={() => void apply()}>{selectedCount}개 변경 적용</button></>}</div></div> : null}
    {status === "rejected" ? <p className={styles.result} role="status">제안을 거절했습니다.</p> : null}
    {status === "cancelled" ? <p className={styles.result} role="status">제안 생성을 취소했습니다.</p> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </section>;
}
