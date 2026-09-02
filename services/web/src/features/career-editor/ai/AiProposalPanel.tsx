"use client";

import type { AiEditProposal, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerDocument } from "@expresso/editor";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

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

  useEffect(() => () => recognitionRef.current?.stop(), []);

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
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
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
  const allBlockIds = documentBlockIds(currentDocument);
  const effectiveBlockIds = scope === "record" && allBlockIds.length ? allBlockIds : selectedBlockIds;

  return <section className={styles.panel} aria-label="AI 편집 도크">
    {proposal && ["ready", "conflicted", "applied"].includes(status) ? <div className={styles.review}><div className={styles.reviewHeading}><div><strong>{proposal.summary}</strong><small>본문 {proposal.commands.length}건 · 속성 {proposal.propertyChanges.length}건</small></div><span>{selectedCount}개 선택</span></div><AiProposalDiff proposal={proposal} document={currentDocument ?? null} definitions={definitions} commandIndexes={commandIndexes} propertyChangeIndexes={propertyIndexes} onCommandToggle={(index) => setCommandIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} onPropertyToggle={(index) => setPropertyIndexes((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} /><div className={styles.reviewActions}>{status === "applied" ? <button type="button" onClick={() => void undo()}>{undoConfirm ? "되돌리기 확인" : "변경 되돌리기"}</button> : <><button type="button" onClick={() => void reject()}>거절</button><button type="button" disabled={selectedCount === 0} onPointerDown={rememberFocus} onClick={() => void apply()}>{selectedCount}개 변경 적용</button></>}</div></div> : null}
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
        <button type="button" className={styles.sendButton} aria-label="제안 만들기" title="제안 만들기" onPointerDown={rememberFocus} disabled={!prompt.trim() || effectiveBlockIds.length === 0 || status === "streaming"} onClick={() => void create(prompt, effectiveBlockIds)}><Icon name="arrow-up" weight="bold" size={17} /></button>
      </div>
      {status === "streaming" ? <div className={styles.progress} role="status"><span className={styles.spinner} aria-hidden="true" />{phase}{proposal?.progress?.total ? ` ${proposal.progress.completed}/${proposal.progress.total}` : ""}<button type="button" onClick={() => void cancel()}>취소</button></div> : null}
    </div>
    {status === "rejected" ? <p className={styles.result} role="status">제안을 거절했습니다.</p> : null}
    {status === "cancelled" ? <p className={styles.result} role="status">제안 생성을 취소했습니다.</p> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </section>;
}
