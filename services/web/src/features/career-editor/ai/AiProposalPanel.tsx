"use client";

import { compareCareerProposalOrder, AiProposalApplyRequestSchema, AiEditProposalDetailSchema, AiProposalUndoResponseSchema, CareerWriteOperationResponseSchema, type AiEditProposal, type AiEditProposalDetail, type AiProposalUndoResult, type CareerWriteOperation, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerDocument } from "@expresso/editor";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { publicAiApplyRejectionFromError, publicWriteOperationFromError } from "@/lib/api/write-operation-errors";
import { Icon } from "@/components/ui/Icon";

import { AiProposalDiff } from "./AiProposalDiff";
import { WriteOperationStatus } from "../write-operations/WriteOperationStatus";
import { durableWriteKey, savedOperation, saveOperation } from "../write-operations/write-operation-client";
import styles from "./ai.module.css";

export type AiProposalStatus = AiEditProposalDetail["status"];
export interface AiPromptRequest { id: string; recordId: string; prompt: string; displayPrompt?: string; blockIds?: string[] }
export interface AiProposalView extends AiEditProposal { status?: AiProposalStatus; progress?: { phase: "preparing" | "generating" | "validating"; completed: number; total?: number | undefined } | null; appliedDocumentVersion?: number | null; revisionId?: string | null; undoScope?: AiEditProposalDetail["undoScope"]; businessChangesRetained?: boolean }
export interface AiProposalClient {
  create(recordId: string, input: { prompt: string; selection: { blockIds: string[] } }): Promise<AiProposalView>;
  get(recordId: string, proposalId: string): Promise<AiProposalView>;
  apply(recordId: string, proposalId: string, input: { expectedDocumentVersion: number; commandIndexes: number[]; propertyChangeIndexes: number[] }): Promise<AiProposalView | CareerWriteOperation>;
  reject(recordId: string, proposalId: string): Promise<void>;
  cancel(recordId: string, proposalId: string): Promise<void>;
  undo(recordId: string, proposalId: string, expectedDocumentVersion: number): Promise<void | AiProposalUndoResult | CareerWriteOperation>;
}

const QUICK_PROMPTS = ["성과를 더 구체적으로", "문장 다듬기", "이 경험에서 스킬 찾기"] as const;
const PROMPT_SOURCES = [
  { key: "record", label: "현재 기록", value: "@현재기록", description: "제목·본문·속성" },
  { key: "selection", label: "선택 영역", value: "@선택영역", description: "선택한 블록만" },
  { key: "properties", label: "기록 속성", value: "@속성", description: "역할·성과·기술" },
] as const;
const PROMPT_COMMANDS = [
  { key: "specific", label: "/구체화", value: QUICK_PROMPTS[0], description: "성과와 행동을 선명하게" },
  { key: "polish", label: "/다듬기", value: QUICK_PROMPTS[1], description: "문장을 자연스럽게" },
  { key: "skills", label: "/스킬", value: QUICK_PROMPTS[2], description: "본문에서 스킬 찾기" },
] as const;
const EDIT_SCOPES = [
  { key: "record", label: "현재 기록", value: "record", description: "본문 전체" },
  { key: "selection", label: "선택 영역", value: "selection", description: "선택한 블록" },
] as const;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function parsePromptToken(value: string): { kind: "source" | "command"; start: number; query: string } | null {
  const match = /(^|\s)([@/])([\p{L}\w-]*)$/u.exec(value);
  if (!match) return null;
  return { kind: match[2] === "@" ? "source" : "command", start: match.index + (match[1] ?? "").length, query: (match[3] ?? "").toLocaleLowerCase("ko") };
}

function documentBlockIds(document: CareerDocument | null | undefined): string[] {
  const visit = (blocks: CareerDocument["content"]): string[] => blocks.flatMap((block) => [block.id, ...(block.content ? visit(block.content) : [])]);
  return document ? visit(document.content) : [];
}

async function data<T>(response: Response): Promise<T> {
  if (!response.ok) { const error = new Error(response.status === 409 || response.status === 412 ? "사람의 편집 내용과 충돌했습니다." : "AI 제안 요청을 처리하지 못했습니다."); (error as Error & { status?: number }).status = response.status; throw error; }
  const body = await response.json() as { data: T };
  return body.data;
}
async function action(response: Response): Promise<void> {
  if (!response.ok) { const error = new Error(response.status === 409 || response.status === 412 ? "사람의 편집 내용과 충돌했습니다." : "AI 제안 요청을 처리하지 못했습니다."); (error as Error & { status?: number }).status = response.status; throw error; }
}
function operationScope(recordId: string, proposalId: string, kind: "apply" | "undo") { return "ai:" + recordId + ":" + proposalId + ":" + kind; }
const ApplyInputSchema=AiProposalApplyRequestSchema.omit({recordId:true,proposalId:true});
type ApplyInput=ReturnType<typeof ApplyInputSchema.parse>;
function applyRequestStorageKey(recordId:string,proposalId:string){return "ex-career-ai-apply:v1:"+recordId+":"+proposalId;}
function savedApplyInput(recordId:string,proposalId:string):ApplyInput|null {
  try {const stored=sessionStorage.getItem(applyRequestStorageKey(recordId,proposalId));if(!stored)return null;const parsed=ApplyInputSchema.safeParse(JSON.parse(stored));return parsed.success?parsed.data:null;}catch{return null;}
}
function saveApplyInput(recordId:string,proposalId:string,input:ApplyInput|null):void {
  try {const key=applyRequestStorageKey(recordId,proposalId);if(input)sessionStorage.setItem(key,JSON.stringify(input));else sessionStorage.removeItem(key);}catch{}
}
class AiApplyPreparationRejectedError extends Error {}
async function ownerRequest(recordId: string, proposalId: string, kind: "apply" | "undo", input: unknown) {
  const key = await durableWriteKey(operationScope(recordId, proposalId, kind), input);
  const response = await fetch("/api/career/records/" + recordId + "/ai-proposals/" + proposalId + "/" + kind, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(input) });
  if (response.status === 202) return CareerWriteOperationResponseSchema.parse(await response.json()).data;
  if (!response.ok) {
    const value:unknown=await response.clone().json().catch(() => null);
    const operation = response.status === 409 || response.status === 412 ? publicWriteOperationFromError(value, "ai-proposal", recordId) : null;
    if (operation) return operation;
    if(kind==="apply" && response.status===409 && publicAiApplyRejectionFromError(value,recordId,proposalId))throw new AiApplyPreparationRejectedError("사람의 편집 내용과 충돌했습니다. 선택한 변경을 확인해 다시 적용해 주세요.");
    return data<never>(response);
  }
  const body: unknown = await response.json();
  if (kind === "apply") return AiEditProposalDetailSchema.parse((body as { data: unknown }).data);
  const result = AiProposalUndoResponseSchema.parse(body);
  return "data" in result ? result.data : result;
}
const defaultClient: AiProposalClient = {
  create: async (recordId, input) => data(await fetch("/api/career/records/" + recordId + "/ai-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })),
  get: async (recordId, proposalId) => data(await fetch("/api/career/records/" + recordId + "/ai-proposals/" + proposalId, { cache: "no-store" })),
  apply: async (recordId, proposalId, input) => ownerRequest(recordId, proposalId, "apply", input) as Promise<AiProposalView | CareerWriteOperation>,
  reject: async (recordId, proposalId) => action(await fetch("/api/career/records/" + recordId + "/ai-proposals/" + proposalId + "/reject", { method: "POST" })),
  cancel: async (recordId, proposalId) => action(await fetch("/api/career/records/" + recordId + "/ai-proposals/" + proposalId + "/cancel", { method: "POST" })),
  undo: async (recordId, proposalId, expectedDocumentVersion) => ownerRequest(recordId, proposalId, "undo", { expectedDocumentVersion }) as Promise<AiProposalUndoResult | CareerWriteOperation>,
};
export function AiProposalPanel({ recordId, documentVersion, selectedBlockIds = [], announcedProposal, requestedPrompt, document: currentDocument, definitions = [], client = defaultClient, onApplied, onRequestHandled, onActiveWriteChange }: {
  recordId: string;
  documentVersion: number;
  selectedBlockIds?: readonly string[];
  announcedProposal?: { proposalId: string; createdAt?: string | undefined; baseDocumentVersion: number; status?: AiProposalStatus; progress?: AiProposalView["progress"] | null } | null;
  requestedPrompt?: AiPromptRequest | null | undefined;
  document?: CareerDocument | null | undefined;
  definitions?: readonly CareerPropertyDefinitionV2[];
  client?: AiProposalClient;
  onApplied?: (() => void | Promise<void>) | undefined;
  onRequestHandled?: (() => void) | undefined;
  onActiveWriteChange?: ((active: boolean) => void) | undefined;
}) {
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<AiProposalView | null>(null);
  const [status, setStatus] = useState<AiProposalStatus>("draft");
  const [commandIndexes, setCommandIndexes] = useState<Set<number>>(new Set());
  const [propertyIndexes, setPropertyIndexes] = useState<Set<number>>(new Set());
  const [issue, setIssue] = useState<string | null>(null);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);
  const [pending, setPending] = useState<{ id: string; recordId: string; proposalId: string; kind: "apply" | "undo"; initial?: CareerWriteOperation } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<"record" | "selection">("record");
  const [menuIndex, setMenuIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const handledRequest = useRef<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const frozenApply=useRef<{recordId:string;proposalId:string;input:ApplyInput}|null>(null);
  const proposalRef = useRef(proposal); proposalRef.current = proposal;
  const latestProposalOrder = useRef<{ proposalId: string; createdAt?: string | undefined } | null>(null);
  useEffect(() => { onActiveWriteChange?.(busy || pending !== null); }, [busy, pending, onActiveWriteChange]);
  const context = useRef({ recordId });
  if (context.current.recordId !== recordId) context.current = { recordId };
  useLayoutEffect(() => {
    setPrompt(""); setProposal(null); setStatus("draft"); setPending(null);
    setIssue(null); setBusy(false); setUndone(false); setUndoConfirm(false);
    setCommandIndexes(new Set()); setPropertyIndexes(new Set());
    handledRequest.current = null; returnFocus.current = null; frozenApply.current=null; proposalRef.current = null; latestProposalOrder.current = null;
  }, [recordId]);

  function rememberFocus() { returnFocus.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null; }
  function rememberFocusIfMissing() { if (!returnFocus.current) rememberFocus(); }
  function restoreFocus() { const target = returnFocus.current; returnFocus.current = null; queueMicrotask(() => target?.focus()); }
  useEffect(() => {
    if (!proposal || pending) return;
    for (const kind of ["undo", "apply"] as const) {
      const id = savedOperation(operationScope(recordId, proposal.proposalId, kind));
      if (id) { setPending({ id, recordId, proposalId: proposal.proposalId, kind }); break; }
    }
  }, [recordId, proposal?.proposalId, pending]);
  function selectAll(next: AiProposalView) { setCommandIndexes(new Set(next.commands.map((_, index) => index))); setPropertyIndexes(new Set(next.propertyChanges.map((_, index) => index))); }
  function adoptProposal(next: AiProposalView) {
    const current = latestProposalOrder.current ?? proposalRef.current;
    if (current && compareCareerProposalOrder(next, current) < 0) return;
    if (proposalRef.current?.proposalId !== next.proposalId) { setUndoConfirm(false); setUndone(false); }
    latestProposalOrder.current = next;
    proposalRef.current = next;
    setProposal(next); setStatus(next.status ?? "ready"); selectAll(next);
  }

  useEffect(() => {
    if (!announcedProposal) return;
    const latest = latestProposalOrder.current ?? proposalRef.current;
    if (latest && compareCareerProposalOrder(announcedProposal, latest) < 0) return;
    latestProposalOrder.current = latest?.proposalId === announcedProposal.proposalId && announcedProposal.createdAt === undefined ? latest : announcedProposal;
    if (proposal?.proposalId === announcedProposal.proposalId) {
      setStatus(announcedProposal.status ?? proposal.status ?? "ready");
      setProposal((current) => current ? { ...current, ...(announcedProposal.status ? { status: announcedProposal.status } : {}), ...(announcedProposal.progress !== undefined ? { progress: announcedProposal.progress } : {}) } : current);
      return;
    }
    let active = true;
    void client.get(recordId, announcedProposal.proposalId).then((next) => { if (!active) return; if (next.recordId !== recordId || next.proposalId !== announcedProposal.proposalId) throw new Error("제안이 요청한 기록과 일치하지 않습니다."); adoptProposal(next); }).catch(() => { if (active) setIssue("제안을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [announcedProposal, client, proposal?.proposalId, recordId]);

  useEffect(() => {
    const requestedBlockIds = requestedPrompt?.blockIds?.length ? requestedPrompt.blockIds : selectedBlockIds;
    if (!requestedPrompt || requestedPrompt.recordId !== recordId || handledRequest.current === requestedPrompt.id || requestedBlockIds.length === 0 || status === "streaming") return;
    handledRequest.current = requestedPrompt.id;
    setPrompt(requestedPrompt.displayPrompt ?? requestedPrompt.prompt);
    const requestContext = context.current;
    void create(requestedPrompt.prompt, requestedBlockIds).finally(() => { if (requestContext === context.current) onRequestHandled?.(); });
  }, [onRequestHandled, recordId, requestedPrompt, selectedBlockIds, status]);

  const token = parsePromptToken(prompt);
  const menuKind = scopeOpen ? "scope" : plusOpen ? "source" : token?.kind ?? null;
  const query = plusOpen ? "" : token?.query ?? "";
  const menuRows = menuKind === "scope"
    ? EDIT_SCOPES
    : menuKind === "source"
    ? PROMPT_SOURCES.filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase("ko").includes(query))
    : menuKind === "command"
      ? PROMPT_COMMANDS.filter((item) => item.label.slice(1).toLocaleLowerCase("ko").includes(query))
      : [];

  useEffect(() => setMenuIndex(0), [menuKind, query]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 32), 104)}px`;
    input.style.overflowY = input.scrollHeight > 104 ? "auto" : "hidden";
  }, [prompt]);

  useEffect(() => {
    if (!plusOpen && !scopeOpen) return;
    const close = (event: PointerEvent) => { if (!composerRef.current?.contains(event.target as Node)) { setPlusOpen(false); setScopeOpen(false); } };
    window.document.addEventListener("pointerdown", close);
    return () => window.document.removeEventListener("pointerdown", close);
  }, [plusOpen, scopeOpen]);

  useEffect(() => () => { context.current = { recordId: context.current.recordId }; recognitionRef.current?.stop(); }, []);

  function pickMenuRow(index: number) {
    const row = menuRows[index];
    if (!row) return;
    if (menuKind === "scope") {
      setScope(row.value as "record" | "selection");
      setScopeOpen(false);
      queueMicrotask(() => inputRef.current?.focus());
      return;
    }
    const prefix = token ? prompt.slice(0, token.start) : prompt ? `${prompt.trimEnd()} ` : "";
    setPrompt(`${prefix}${row.value} `);
    setPlusOpen(false);
    queueMicrotask(() => inputRef.current?.focus());
  }

  function toggleDictation() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const speechWindow = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) { setIssue("이 브라우저에서는 음성 입력을 사용할 수 없습니다."); return; }
    setIssue(null);
    const recognition = new Constructor();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript?.trim(); if (transcript) setPrompt((current) => current ? `${current.trimEnd()} ${transcript}` : transcript); };
    recognition.onerror = () => { setListening(false); setIssue("음성 입력을 완료하지 못했습니다."); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function create(nextPrompt = prompt, blockIds: readonly string[] = selectedBlockIds) {
    if (!nextPrompt.trim() || busy || pending) return;
    const requestContext = context.current;
    setIssue(null); setStatus("streaming"); rememberFocusIfMissing();
    try { const next = await client.create(recordId, { prompt: nextPrompt.trim(), selection: { blockIds: [...blockIds] } }); if (requestContext !== context.current) return; if (next.recordId !== recordId) throw new Error("제안이 요청한 기록과 일치하지 않습니다."); adoptProposal(next); }
    catch (error) { if (requestContext !== context.current) return; setStatus("draft"); setIssue(error instanceof Error ? error.message : "제안을 만들지 못했습니다."); }
    finally { if (requestContext === context.current) restoreFocus(); }
  }

  function startPending(operation: CareerWriteOperation, kind: "apply" | "undo") {
    if (!proposal || operation.producer !== "ai-proposal" || (operation.recordId !== null && operation.recordId !== recordId)) throw new Error("작업이 요청한 기록과 일치하지 않습니다.");
    saveOperation(operationScope(recordId, proposal.proposalId, kind), operation.operationId);
    setPending({ id: operation.operationId, recordId, proposalId: proposal.proposalId, kind, initial: operation });
  }
  async function apply() {
    if (!proposal || busy || pending) return;
    const requestContext = context.current;
    setIssue(null); setBusy(true); rememberFocusIfMissing();
    let ownerCompleted = false;
    let attemptedInput:ApplyInput|undefined;
    try {
      // 응답 유실 뒤에도 최초 선택과 문서 버전으로 같은 owner intent를 확인합니다.
      const prior=frozenApply.current;
      const input=prior?.recordId===recordId&&prior.proposalId===proposal.proposalId?prior.input:savedApplyInput(recordId,proposal.proposalId)??{expectedDocumentVersion:documentVersion,commandIndexes:[...commandIndexes].sort((a,b)=>a-b),propertyChangeIndexes:[...propertyIndexes].sort((a,b)=>a-b)};
      attemptedInput=input;
      frozenApply.current={recordId,proposalId:proposal.proposalId,input};saveApplyInput(recordId,proposal.proposalId,input);
      const result = await client.apply(recordId, proposal.proposalId, input);
      if (requestContext !== context.current) return;
      if ("operationId" in result) startPending(result, "apply");
      else { if (result.recordId !== recordId || result.proposalId !== proposal.proposalId) throw new Error("제안이 요청한 기록과 일치하지 않습니다."); ownerCompleted = true; saveApplyInput(recordId,proposal.proposalId,null); frozenApply.current=null; if (proposalRef.current?.proposalId === proposal.proposalId) { proposalRef.current = result; setProposal(result); setStatus(result.status ?? "applied"); } await onApplied?.(); }
    } catch (error) {
      if(!ownerCompleted && error instanceof AiApplyPreparationRejectedError) {
        const current=frozenApply.current;
        const sameScope=current?.recordId===recordId && current.proposalId===proposal.proposalId;
        // 이전 응답이 같은 기록으로 돌아온 뒤 시작한 새 replay의 입력을 지우지 않습니다.
        if((!sameScope || current.input===attemptedInput) && JSON.stringify(savedApplyInput(recordId,proposal.proposalId))===JSON.stringify(attemptedInput))saveApplyInput(recordId,proposal.proposalId,null);
        if(sameScope && current.input===attemptedInput)frozenApply.current=null;
      }
      if (requestContext !== context.current || proposalRef.current?.proposalId!==proposal.proposalId) return;
      if (!ownerCompleted) setStatus("conflicted"); setIssue(error instanceof Error ? error.message : "제안을 적용하지 못했습니다.");
    }
    finally { if (requestContext === context.current) { setBusy(false); restoreFocus(); } }
  }
  async function reject() {
    if (!proposal || busy || pending) return;
    const requestContext = context.current;
    const requestedProposalId = proposal.proposalId;
    setIssue(null);
    try {
      await client.reject(recordId, requestedProposalId);
      if (requestContext === context.current && proposalRef.current?.proposalId === requestedProposalId) setStatus("rejected");
    } catch (error) {
      if (requestContext === context.current && proposalRef.current?.proposalId === requestedProposalId) setIssue(error instanceof Error ? error.message : "제안을 거절하지 못했습니다.");
    }
  }
  async function cancel() { if (!proposal || busy || pending) return; const requestContext = context.current; setIssue(null); try { await client.cancel(recordId, proposal.proposalId); if (requestContext === context.current) setStatus("cancelled"); } catch (error) { if (requestContext === context.current) setIssue(error instanceof Error ? error.message : "제안 생성을 취소하지 못했습니다."); } }
  function finishUndo(target: AiProposalView, result: void | AiProposalUndoResult) {
    if (proposalRef.current?.proposalId !== target.proposalId) return;
    setUndoConfirm(false);
    if (result && "outcome" in result) { setProposal(current => current?.proposalId === target.proposalId ? { ...current, undoScope: "none", businessChangesRetained: true } : current); setStatus("applied"); return; }
    if (target.undoScope === "document") { setUndone(true); setStatus("applied"); }
    else setStatus("ready");
  }
  async function undo() {
    if (!proposal || busy || pending || undone || proposal.undoScope === "none") return;
    if (!undoConfirm) { setUndoConfirm(true); return; }
    const target = proposal;
    const requestContext = context.current;
    setIssue(null); setBusy(true);
    try {
      const result = await client.undo(recordId, target.proposalId, target.appliedDocumentVersion ?? documentVersion);
      if (requestContext !== context.current) return;
      if (result && "operationId" in result) startPending(result, "undo");
      else { finishUndo(target, result); if (!result || !("outcome" in result)) await onApplied?.(); }
    } catch (error) { if (requestContext === context.current && proposalRef.current?.proposalId === target.proposalId) setIssue(error instanceof Error ? error.message : "변경을 되돌리지 못했습니다."); }
    finally { if (requestContext === context.current) setBusy(false); }
  }
  async function completedOperation() {
    if (!pending) return;
    const owned = pending;
    const requestContext = context.current;
    // 완료 확인 즉시 원래 기록의 목록 캐시를 갱신합니다. 새 제안 도착은 작업 소유권을 바꾸지 않습니다.
    await onApplied?.();
    if (requestContext !== context.current) return;
    const next = await client.get(owned.recordId, owned.proposalId);
    if (requestContext !== context.current) return;
    if (next.recordId !== owned.recordId || next.proposalId !== owned.proposalId) throw new Error("제안이 요청한 기록과 일치하지 않습니다.");
    if (owned.kind === "apply") {
      saveApplyInput(owned.recordId, owned.proposalId, null);
      if (frozenApply.current?.recordId === owned.recordId && frozenApply.current.proposalId === owned.proposalId) frozenApply.current = null;
    }
    if (proposalRef.current?.proposalId === owned.proposalId) {
      setProposal(next); setStatus(next.status ?? "applied");
      if (owned.kind === "undo") setUndone(true);
    }
    saveOperation(operationScope(owned.recordId, owned.proposalId, owned.kind), null);
    setPending(current => current?.id === owned.id ? null : current);
  }
  const phase = proposal?.progress?.phase === "preparing" ? "문맥 준비 중" : proposal?.progress?.phase === "validating" ? "변경 검증 중" : "제안 작성 중";
  const selectedCount = commandIndexes.size + propertyIndexes.size;
  const allBlockIds = documentBlockIds(currentDocument);
  const effectiveBlockIds = scope === "record" && allBlockIds.length ? allBlockIds : selectedBlockIds;

  return <section className={styles.panel} aria-label="AI 편집 도크">
    {pending ? <WriteOperationStatus key={pending.id} operationId={pending.id} initial={pending.initial} scope={operationScope(pending.recordId, pending.proposalId, pending.kind)} producer="ai-proposal" recordId={pending.recordId} onCompleted={completedOperation} /> : null}
    {proposal && ["ready", "conflicted", "applied"].includes(status) ? <div className={styles.review}><div className={styles.reviewHeading}><div><strong>{proposal.summary}</strong><small>본문 {proposal.commands.length}건 · 속성 {proposal.propertyChanges.length}건</small></div><span>{selectedCount}개 선택</span></div><AiProposalDiff proposal={proposal} document={currentDocument ?? null} definitions={definitions} commandIndexes={commandIndexes} propertyChangeIndexes={propertyIndexes} onCommandToggle={(index) => setCommandIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} onPropertyToggle={(index) => setPropertyIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} /><div className={styles.reviewActions}>{pending ? null : status === "applied" ? proposal.undoScope === "none" ? <p>문서 복원 대상이 없습니다. 속성 변경은 적용된 상태입니다.</p> : undone ? <p>본문을 되돌렸습니다.{proposal.businessChangesRetained ? " 속성 변경은 유지됩니다." : ""}</p> : <><button type="button" disabled={busy} onClick={() => void undo()}>{proposal.undoScope === "document" ? undoConfirm ? "본문 되돌리기 확인" : "본문 변경 되돌리기" : undoConfirm ? "되돌리기 확인" : "변경 되돌리기"}</button>{proposal.businessChangesRetained ? <p>속성 변경은 유지됩니다.</p> : null}</> : <><button type="button" onClick={() => void reject()}>거절</button><button type="button" disabled={selectedCount === 0 || busy || pending !== null} onPointerDown={rememberFocus} onClick={() => void apply()}>{selectedCount}개 변경 적용</button></>}</div></div> : null}
    <div ref={composerRef} className={styles.composerAnchor} data-ai-composer>
      {menuKind ? <div className={styles.promptMenu} data-menu={menuKind} role="listbox" aria-label={menuKind === "scope" ? "AI 편집 범위" : menuKind === "source" ? "AI 컨텍스트" : "AI 빠른 명령"}>
        {menuRows.map((row, index) => <button key={row.key} type="button" role="option" aria-selected={menuIndex === index} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMenuIndex(index)} onClick={() => pickMenuRow(index)}><span><strong>{row.label}</strong><small>{row.description}</small></span>{menuIndex === index ? <Icon name="arrow-return-left" size={12} /> : null}</button>)}
        {menuRows.length === 0 ? <p>일치하는 항목이 없습니다.</p> : null}
      </div> : null}
      <div className={styles.composer}>
        <button type="button" className={styles.contextButton} aria-label="AI 컨텍스트 추가" aria-expanded={plusOpen} onClick={() => { setScopeOpen(false); setPlusOpen((current) => !current); queueMicrotask(() => inputRef.current?.focus()); }}><Icon name="plus" size={18} /></button>
        <textarea ref={inputRef} rows={1} aria-label="AI에게 편집 요청" value={prompt} maxLength={4_000} placeholder="메시지를 입력하세요…" onChange={(event) => { setPrompt(event.target.value); setPlusOpen(false); setScopeOpen(false); }} onKeyDown={(event) => {
          if (menuKind && menuRows.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setMenuIndex((current) => (current + (event.key === "ArrowDown" ? 1 : menuRows.length - 1)) % menuRows.length); return; }
            if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") { event.preventDefault(); pickMenuRow(menuIndex); return; }
          }
          if (event.key === "Escape") { setPlusOpen(false); setScopeOpen(false); return; }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void create(prompt, effectiveBlockIds); }
        }} />
        <button type="button" className={styles.scopeButton} aria-label="AI 편집 범위" aria-expanded={scopeOpen} onClick={() => { setPlusOpen(false); setScopeOpen((current) => !current); }}>{scope === "record" ? "현재 기록" : "선택 영역"}<Icon name="caret-down" size={11} /></button>
        <button type="button" className={styles.dictationButton} aria-label={listening ? "음성 입력 중지" : "음성 입력"} aria-pressed={listening} onClick={toggleDictation}>{listening ? <span className={styles.listeningDot} /> : <Icon name="microphone" size={17} />}</button>
        <button type="button" className={styles.sendButton} aria-label="제안 만들기" title="제안 만들기" onPointerDown={rememberFocus} disabled={!prompt.trim() || effectiveBlockIds.length === 0 || status === "streaming" || busy || pending !== null} onClick={() => void create(prompt, effectiveBlockIds)}><Icon name="arrow-up" weight="bold" size={17} /></button>
      </div>
      {status === "streaming" ? <div className={styles.progress} role="status"><span className={styles.spinner} aria-hidden="true" />{phase}{proposal?.progress?.total ? ` ${proposal.progress.completed}/${proposal.progress.total}` : ""}<button type="button" onClick={() => void cancel()}>취소</button></div> : null}
    </div>
    {status === "rejected" ? <p className={styles.result} role="status">제안을 거절했습니다.</p> : null}
    {status === "cancelled" ? <p className={styles.result} role="status">제안 생성을 취소했습니다.</p> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </section>;
}
