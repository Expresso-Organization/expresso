"use client";
import { createContext, useContext, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { useRouter } from "next/navigation";
import { AssistantRuntimeProvider, useExternalStoreRuntime, useAui, useAuiState, type ThreadMessageLike, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { AgentChatAccessSchema, AgentResourceDetailSchema } from "@expresso/contracts";
import type { AgentContext, AgentMessage, AgentPageSelection, AiEditProposalDetail, CareerDocumentBootstrap } from "@expresso/contracts";
import { ResourcePreview, type PreviewResource } from "./ResourcePreview";
import { RequirementReviewCard } from "./RequirementReviewCard";
import { RecordDraftCard } from "./RecordDraftCard";
import { GapReviewCard } from "./GapReviewCard";
import { PlanDraftCard } from "./PlanDraftCard";
import { PlanCard } from "./PlanCard";
import { ReplanDraftCard } from "./ReplanDraftCard";
import { PageEditCard } from "./PageEditCard";
import { AgentConsentDialog } from "./AgentConsentDialog";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { AiProposalDiff } from "@/features/career-editor/ai/AiProposalDiff";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ToolGroupRoot, ToolGroupContent, ToolGroupTrigger } from "@/components/assistant-ui/elements/tool-group.aui";
import { Button } from "@/components/ui/button";
import type { ThreadGroupPart } from "@/components/assistant-ui/elements/thread.aui";
import type { PropsWithChildren, ReactNode } from "react";
import "@/styles/agent-chat-framework.css";
import { useAgentConversation } from "./useAgentConversation";
import { ToolStep } from "./ToolStep";
import styles from "./AgentChat.module.css";

/** 프레임워크 원본 Thread를 사용하고 도메인 도구의 승인 화면만 확장합니다. */
const ChatContext = createContext<ReturnType<typeof useAgentConversation> | null>(null);
/** 공고 상세 우측 레일에서 여는 대화의 공고. 첫 화면과 시작 제안이 이 공고를 기준으로 바뀐다. */
export type AgentChatJob = { id: string; title: string; company: string };
const JobContext = createContext<AgentChatJob | null>(null);
/**
 * 다듬기 화면에서 연 대화의 지면. 첫 화면 · 입력창 위 대상 표시 · 고침 카드의 되돌리기가 이것을 본다. `revision`은 화면이
 * 보고 있는 최신 판 번호다 — 고침 카드는 자기 판이 최신이 아니면 되돌리기를 막는다.
 */
export type AgentChatPage = { portfolioId: string; title: string; revision: number; selection: AgentPageSelection | null };
const PageContext = createContext<AgentChatPage | null>(null);
/**
 * 고침 카드의 판이 화면의 최신 판인가. 화면이 더 뒤의 판을 보고 있을 때만 false다. 고침 직후 화면이 아직 옛 판을 보고 있으면
 * (새로고침 전) 모르는 것(undefined)으로 두고 서버가 판단한다.
 */
function pageEditLatest(page: AgentChatPage | null, edit: { portfolioId: string; revision: number }) {
  if (page?.portfolioId !== edit.portfolioId) return undefined;
  return page.revision === edit.revision ? true : page.revision > edit.revision ? false : undefined;
}
function AssistantIdentity() {
  const running = useAuiState(s => s.message.status?.type === "running");
  return <div className={styles.identity}><LogoMark size={20} /><span>Expresso AI</span>{running ? <span className={styles.working}>함께 살펴보는 중</span> : null}</div>;
}
const STARTERS = [
  { icon: "target", title: "공고와 경험 비교", description: "이 기회에 맞는 내 경험 찾기", prompt: "연결한 공고의 요구사항과 내 커리어 기록을 비교해 줘." },
  { icon: "chat-circle-dots", title: "경험 구체화", description: "역할과 성과를 질문으로 정리", prompt: "내 커리어 기록에서 역할·행동·성과가 부족한 부분을 질문해 줘." },
  { icon: "pencil-line", title: "기록 다듬기", description: "더 잘 읽히는 문장으로 제안", prompt: "연결한 기록의 문장을 다듬는 변경 제안을 만들어 줘." },
];
/** 공고 하나만 연결된 대화에서도 답할 수 있는 것만 둔다 — 기록을 연결해야 하는 제안은 없다. */
const JOB_STARTERS = [
  { icon: "list-checks", title: "요건과 내 기록 비교", prompt: "이 공고의 자격 요건을 내 커리어 기록과 비교해 줘. 근거가 있는 요건과 근거가 약하거나 없는 요건을 나눠서 알려 줘." },
  { icon: "magnifying-glass", title: "이 공고가 보는 역량", prompt: "이 공고가 가장 중요하게 보는 역량과 경험을 우선순위대로 정리해 줘." },
  { icon: "chat-circle-dots", title: "부족한 요건 보완 질문", prompt: "근거가 약하거나 없는 요건부터 내 경험을 확인할 질문을 한 번에 하나씩 해 줘." },
];
function useStarter() {
  const runtime = useAui();
  const welcome = useRef<HTMLDivElement>(null);
  const start = (prompt: string) => { runtime.thread.composer().setText(prompt); welcome.current?.closest(".aui-thread-root")?.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus(); };
  return { welcome, start };
}
function ChatWelcome() {
  const job = useContext(JobContext);
  const page = useContext(PageContext);
  return job ? <JobWelcome job={job} /> : page ? <PageWelcome page={page} /> : <GeneralWelcome />;
}
/** 다듬기 화면의 시작 제안. 모두 고른 요소 하나를 고치는 말이라 요소를 고르기 전에는 막는다. */
const PAGE_STARTERS = [
  { icon: "arrows-in-line-horizontal", title: "더 짧게 다듬기", prompt: "이 요소의 글을 뜻은 그대로 두고 더 짧게 다듬어 줘." },
  { icon: "chart-bar", title: "성과가 먼저 보이게", prompt: "이 요소에서 성과와 수치가 먼저 읽히도록 고쳐 줘. 출처에 없는 수치는 넣지 마." },
  { icon: "text-aa", title: "제목을 강조색으로", prompt: "이 요소의 제목을 강조색으로 바꿔 줘." },
];
function PageWelcome({ page }: { page: AgentChatPage }) {
  const { welcome, start } = useStarter();
  return <div ref={welcome} className={styles.jobWelcome}>
    <span className={styles.jobCompany}>{page.title}</span>
    <h1 className={styles.jobTitle}>{page.selection ? page.selection.label : "고칠 요소를 고르세요"}</h1>
    <p>{page.selection ? "이 요소를 말로 고칩니다. 고친 내용은 새 판으로 저장되고 되돌릴 수 있습니다." : "지면이나 목차에서 요소를 고르면 그 요소를 말로 고칩니다."}</p>
    <div className={styles.jobStarters}>{PAGE_STARTERS.map(item => <Button key={item.title} variant="ghost" className={styles.jobStarter} disabled={!page.selection} onClick={() => start(item.prompt)}><Icon name={item.icon} size={16} /><span>{item.title}</span><Icon name="arrow-up-right" size={13} /></Button>)}</div>
  </div>;
}
/** 보낼 말이 가리킬 요소. 다듬기 화면에서 요소를 골랐을 때만 입력창 위에 보인다. */
function ComposerTarget() {
  const selection = useContext(PageContext)?.selection;
  if (!selection) return null;
  return <div className={styles.target} aria-label="고칠 요소"><Icon name="cursor-click" size={12} /><span>{selection.label}</span></div>;
}
/** 보낸 말이 가리킨 요소. 저장된 메시지의 selection을 그대로 보인다. */
function UserMessageTarget() {
  const selection = useAuiState(s => (s.message.metadata.custom as { selection?: AgentPageSelection } | undefined)?.selection);
  if (!selection) return null;
  return <div className={`${styles.target} ${styles.sentTarget}`}><Icon name="cursor-click" size={12} /><span>{selection.label}</span></div>;
}
function JobWelcome({ job }: { job: AgentChatJob }) {
  const { welcome, start } = useStarter();
  return <div ref={welcome} className={styles.jobWelcome}>
    <span className={styles.jobCompany}>{job.company}</span>
    <h1 className={styles.jobTitle}>{job.title}</h1>
    <p>이 공고를 기준으로 내 기록을 살펴봅니다.</p>
    <div className={styles.jobStarters}>{JOB_STARTERS.map(item => <Button key={item.title} variant="ghost" className={styles.jobStarter} onClick={() => start(item.prompt)}><Icon name={item.icon} size={16} /><span>{item.title}</span><Icon name="arrow-up-right" size={13} /></Button>)}</div>
  </div>;
}
function GeneralWelcome() {
  const { welcome, start } = useStarter();
  return <div ref={welcome} className={styles.welcome}>
    <div className={styles.welcomeMark}><LogoMark size={44} /></div>
    <span className={styles.eyebrow}>내 기록에서, 다음 기회까지</span>
    <h1>내 경험을,<br /><span>다음 기회로.</span></h1>
    <p>관심 있는 공고와 커리어 기록을 연결해 주세요.<br />어떤 경험을 보여줄지 함께 정리합니다.</p>
    <div className={styles.starters}>{STARTERS.map(item => <Button key={item.title} variant="ghost" className={styles.starter} onClick={() => start(item.prompt)}><Icon name={item.icon} size={19} /><strong>{item.title}</strong><span>{item.description}</span><Icon name="arrow-up-right" size={14} /></Button>)}</div>
  </div>;
}
/** 작업 흔적의 아이콘. 키는 서버가 보내는 도구 이름(platform/agent/runtime.ts의 step 이름)이다. */
const TOOL_ICONS: Record<string, string> = {
  "기록 목록 확인": "list-bullets", "기록 읽기": "book-open-text", "요건 대조": "list-checks", "새 기록 초안": "note-pencil", "기록 변경 제안": "pencil-line",
  "보완점 정리": "target", "준비 계획 초안": "calendar-check", "계획 진행 확인": "chart-line-up", "계획 재배치 초안": "arrows-clockwise",
  "지면 요소 읽기": "cursor-click", "지면 요소 고침": "pencil-simple-line",
};
/**
 * 도구 호출 하나를 작업 흔적의 한 단계로 그린다. 결과의 모양으로 단계 아래를 나눈다 — 요건 대조 · 보완점 · 새 기록 · 준비 계획 ·
 * 재배치는 카드(카드가 요약을 담으므로 단계 요약은 비운다), 기록 변경 제안은 승인 화면, 그 밖은 요약만. 승인 · 거절은 AI를 부르지 않으므로 실행 중에만 막는다.
 */
const RecordTool: ToolCallMessagePartComponent = props => {
  const state = useContext(ChatContext)!;
  const page = useContext(PageContext);
  const tool = state.conversation?.messages.flatMap(message => message.tools).find(tool => tool.id === props.toolCallId);
  const busy = state.pending || state.conversation?.run?.status === "running";
  const name = tool?.name ?? props.toolName;
  const step = (detail: ReactNode, summary: string | null = tool?.summary ?? null) => <ToolStep status={tool?.status ?? (props.status.type === "running" ? "running" : "complete")} icon={TOOL_ICONS[name] ?? "wrench"} title={name} summary={summary ?? undefined}>{detail}</ToolStep>;
  if (tool?.review) return step(<RequirementReviewCard conversationId={state.id} toolId={tool.id} review={tool.review} />, null);
  if (tool?.gapReview) return step(<GapReviewCard conversationId={state.id} toolId={tool.id} gapReview={tool.gapReview} />, null);
  if (tool?.recordDraft) { const draftId = tool.recordDraft.draftId; return step(<RecordDraftCard draft={tool.recordDraft} disabled={busy} onDecide={decision => state.decideDraft(draftId, decision)} />, null); }
  if (tool?.planDraft) {
    const { draftId, planId, status } = tool.planDraft;
    if (status === "approved" && planId) return step(<PlanCard planId={planId} refreshKey={state.conversation?.version} />, null);
    return step(<PlanDraftCard draft={tool.planDraft} disabled={busy} onDecide={decision => state.decidePlanDraft(draftId, decision)} />, null);
  }
  if (tool?.replanDraft) { const draftId = tool.replanDraft.draftId; return step(<ReplanDraftCard draft={tool.replanDraft} disabled={busy} onDecide={decision => state.decideReplanDraft(draftId, decision)} />, null); }
  if (tool?.pageEdit) { const edit = tool.pageEdit; return step(<PageEditCard edit={edit} latest={pageEditLatest(page, edit)} disabled={busy} onUndo={() => state.undoPageEdit(edit.editId)} />, null); }
  return step(tool?.proposal ? <Proposal proposal={tool.proposal} beforeDocument={tool.beforeDocument} undone={tool.undone} /> : null);
};
function ExpandedTools({ group, children }: PropsWithChildren<{ group: ThreadGroupPart }>) {
  return <ToolGroupRoot variant="ghost" defaultOpen><ToolGroupTrigger count={group.indices.length} active={group.status.type === "running"} /><ToolGroupContent><div className={styles.trace}>{children}</div></ToolGroupContent></ToolGroupRoot>;
}
function Proposal({ proposal, beforeDocument, undone }: { proposal: AiEditProposalDetail; beforeDocument?: CareerDocumentBootstrap["document"] | undefined; undone?: boolean | undefined }) {
  const state = useContext(ChatContext)!; const router = useRouter();
  const [commands, setCommands] = useState(new Set(proposal.commands.map((_, i) => i)));
  const [properties, setProperties] = useState(new Set(proposal.propertyChanges.map((_, i) => i)));
  const toggle = (current: Set<number>, index: number) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; };
  return <><AiProposalDiff proposal={proposal} document={beforeDocument ?? null} commandIndexes={commands} propertyChangeIndexes={properties} onCommandToggle={index => setCommands(current => toggle(current, index))} onPropertyToggle={index => setProperties(current => toggle(current, index))} />
    <p className={styles.proposalStatus} data-state={undone ? "undone" : proposal.status}>{undone ? "변경을 되돌렸습니다." : proposal.status === "applied" ? "기록에 적용했습니다." : proposal.status === "ready" ? "검토 후 적용해 주세요." : proposal.status === "rejected" ? "제안을 거절했습니다." : "제안을 더 이상 적용할 수 없습니다."}</p>
    {proposal.status === "ready" ? <div className={styles.actions}><Button className={styles.applyButton} disabled={state.pending || state.conversation?.run?.status === "running" || !(commands.size + properties.size)} onClick={() => void state.approve({ proposalId: proposal.proposalId, action: "apply", expectedDocumentVersion: proposal.baseDocumentVersion, commandIndexes: [...commands], propertyChangeIndexes: [...properties] }).then(() => router.refresh())}>선택한 변경 적용</Button><Button variant="outline" disabled={state.pending} onClick={() => void state.approve({ proposalId: proposal.proposalId, action: "reject", expectedDocumentVersion: proposal.baseDocumentVersion })}>거절</Button></div> : null}
    {proposal.status === "applied" && !undone ? <Button variant="outline" disabled={state.pending} onClick={() => void state.approve({ proposalId: proposal.proposalId, action: "undo", expectedDocumentVersion: proposal.appliedDocumentVersion! }).then(() => router.refresh())}>변경 되돌리기</Button> : null}
  </>;
}
const convertMessage = (message: AgentMessage): ThreadMessageLike => ({
  id: message.id, role: message.role, createdAt: new Date(message.createdAt),
  ...(message.selection ? { metadata: { custom: { selection: message.selection } } } : {}),
  content: [
    ...message.tools.map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name, args: {}, argsText: "{}", ...(tool.status === "running" ? {} : { result: { summary: tool.summary }, isError: tool.status === "failed" }) })),
    { type: "text", text: message.text },
  ],
});
export function AgentChat({ job, page, standalone = false, onRunningChange, ...props }: {
  context?: AgentContext; contextLabel?: string; standalone?: boolean; job?: AgentChatJob;
  /** 다듬기 화면의 지면. 대화는 이 포트폴리오가 연결된 가장 최근 대화로 열리고, 보내는 말에 고른 요소가 붙는다. */
  page?: AgentChatPage;
  /** 응답 진행 여부가 바뀔 때. 레일이 접혀 있으면 머리의 채팅 버튼이 진행 표시를 그린다. */
  onRunningChange?: ((running: boolean) => void) | undefined;
}) {
  const context: AgentContext | undefined = job ? { kind: "job", id: job.id } : page ? { kind: "portfolio", id: page.portfolioId } : props.context;
  const contextLabel = job?.title ?? page?.title ?? props.contextLabel;
  const state = useAgentConversation(context, job || page ? { restore: "context" } : {});
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResource | null>(null);
  const [contextTitles, setContextTitles] = useState<Record<string, string>>({});
  const contextKeys = (state.conversation?.contexts ?? []).map(ref => `${ref.kind}:${ref.id}`).join(",");
  useEffect(() => {
    const controller = new AbortController();
    const missing = contextKeys.split(",").filter(key => key && !contextTitles[key]);
    if (!missing.length) return;
    void Promise.all(missing.map(async key => {
      const [kind, id] = key.split(":");
      const path = kind === "job" ? "jobs" : kind === "record" ? "records" : "portfolios";
      try {
        const response = await fetch(`/api/agent/resources/${path}/${id}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return null;
        return [key, AgentResourceDetailSchema.parse(await response.json()).data.title] as const;
      } catch { return null; }
    })).then(entries => {
      const titles = Object.fromEntries(entries.filter(entry => entry !== null));
      if (!controller.signal.aborted && Object.keys(titles).length) setContextTitles(current => ({ ...current, ...titles }));
    });
    return () => controller.abort();
  }, [contextKeys, contextTitles]);
  const toggleContext = (ref: AgentContext, title: string) => { setContextTitles(current => ({ ...current, [`${ref.kind}:${ref.id}`]: title })); void state.toggleContext(ref); };
  const contextDisabled = state.pending || state.conversation?.run?.status === "running" || (!!state.id && !state.conversation);
  const [access, setAccess] = useState<ReturnType<typeof AgentChatAccessSchema.parse>["data"] | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  useEffect(() => { if (standalone && access?.enabled && (access.consentRequired || (!access.serverCredentialAllowed && !access.apiKeyConfigured))) setConsentOpen(true); }, [standalone, access?.enabled, access?.consentRequired, access?.serverCredentialAllowed, access?.apiKeyConfigured]);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/agent/access", { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("access"); setAccess(AgentChatAccessSchema.parse(await response.json()).data); }).catch(() => { if (!controller.signal.aborted) setAccessError(true); }); return () => controller.abort(); }, []);
  const canSend = !!access?.enabled && !access.consentRequired && (access.serverCredentialAllowed || access.apiKeyConfigured);
  const running = state.conversation?.run?.status === "running";
  useEffect(() => { onRunningChange?.(running); }, [onRunningChange, running]);
  const runtime = useExternalStoreRuntime({ messages: state.conversation?.messages ?? [], convertMessage, isRunning: running, isLoading: state.resolving || (!!state.id && !state.conversation), isDisabled: !!preview || !canSend || state.pending || state.resolving || (!!state.id && !state.conversation), onNew: async message => { const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n"); try { await state.send(text, page?.selection ?? undefined); } catch { runtime.thread.composer.setText(text); } }, onCancel: state.cancel });
  // 지면 고침이 저장되거나 되돌려지면 화면의 미리보기 · 판 번호를 다시 불러온다. 처음 불러온 대화의 카드로는 다시 부르지 않는다.
  const pageEdits = (state.conversation?.messages ?? []).flatMap(message => message.tools).flatMap(tool => tool.pageEdit && tool.status === "complete" ? [`${tool.pageEdit.editId}:${tool.pageEdit.undone}`] : []).join(",");
  const seenEdits = useRef<{ id: string | null; edits: string } | null>(null);
  useEffect(() => {
    if (!state.conversation) return;
    const seen = seenEdits.current;
    seenEdits.current = { id: state.conversation.id, edits: pageEdits };
    if (page && seen?.id === state.conversation.id && seen.edits !== pageEdits) router.refresh();
  }, [page, pageEdits, router, state.conversation]);
  const lastRun = state.conversation?.run;
  const canRetry = !!lastRun && ["failed", "interrupted", "cancelled"].includes(lastRun.status) && state.conversation?.messages.at(-1)?.role === "assistant";
  const retryButton = canRetry ? <Button variant="outline" size="sm" className={styles.retryButton} disabled={!canSend || state.pending} onClick={() => void state.retry()}><Icon name="arrow-clockwise" size={13} />다시 보내기</Button> : null;
  const missing = context && state.conversation && !state.conversation.contexts.some(ref => ref.kind === context.kind && ref.id === context.id);
  return <ChatContext.Provider value={state}><JobContext.Provider value={job ?? null}><PageContext.Provider value={page ?? null}><AssistantRuntimeProvider runtime={runtime}>
    {preview ? <ResourcePreview resource={preview} onClose={() => setPreview(null)} selected={!!state.conversation?.contexts.some(ref => ref.kind === preview.kind && ref.id === preview.id)} disabled={contextDisabled} onToggle={toggleContext} /> : null}
    <AgentConsentDialog consentRequired={access?.consentRequired ?? true} requiresKey={!!access && !access.serverCredentialAllowed && !access.apiKeyConfigured} onKeySaved={() => setAccess(current => current ? { ...current, apiKeyConfigured: true } : current)} open={consentOpen} onOpenChange={setConsentOpen} onConsented={() => setAccess(current => current ? { ...current, consentRequired: false } : current)} />
    <section className={`acf-scope ${styles.root} ${job || page ? styles.rail : standalone ? styles.standalone : styles.panel}`} aria-label="에이전트 채팅">
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.heading}><span className={styles.assistantMark}><LogoMark size={22} /></span><div><strong>{state.conversation?.title ?? "새 대화"}</strong><span>{running ? "답변을 준비하고 있어요" : "Expresso AI"}</span></div></div>
          <div className={styles.headerActions}><span className={standalone ? styles.compactHistory : undefined}><ConversationSwitcher contexts={state.conversation?.contexts ?? []} contextDisabled={contextDisabled} onToggleContext={toggleContext} onPreview={setPreview} currentId={state.id} conversations={state.list} disabled={state.pending} onSelect={state.select} /></span>{!standalone ? <Link aria-label="독립 채팅으로 크게 열기" title="크게 열기" href={{ pathname: "/agent", query: state.id ? { chat: state.id } : {} }}><Icon name="arrows-out-simple" size={17} /></Link> : null}<Button variant="ghost" size="icon" aria-label="새 대화" title="새 대화" disabled={state.pending} onClick={() => state.select(null)}><Icon name="note-pencil" size={18} /></Button></div>
        </header>

        <div className={styles.contexts} aria-label="대화에 연결된 자료">
          <span className={styles.contextLabel}><Icon name="paperclip" size={14} />함께 보는 자료</span>
          <div className={styles.referenceItems}>{state.conversation?.contexts.map((ref, index) => {
            const title = contextTitles[`${ref.kind}:${ref.id}`] ?? (context?.id === ref.id && contextLabel ? contextLabel : `${ref.kind === "job" ? "채용 공고" : ref.kind === "record" ? "커리어 기록" : "포트폴리오"} ${index + 1}`);
            return <span className={styles.reference} data-kind={ref.kind} key={`${ref.kind}:${ref.id}`}><button className={styles.referenceTitle} onClick={() => setPreview({ ...ref, title })}><Icon name={ref.kind === "job" ? "target" : ref.kind === "record" ? "notebook" : "browsers"} size={14} /><span>{title}</span></button><button className={styles.referenceRemove} aria-label={`${title} AI 문맥에서 제외`} disabled={contextDisabled} onClick={() => toggleContext(ref, title)}><Icon name="x" size={12} /></button></span>;
          })}
          {!state.id && contextLabel ? <span className={styles.reference} data-kind={context?.kind}><Icon name={context?.kind === "job" ? "target" : context?.kind === "portfolio" ? "browsers" : "notebook"} size={14} />{contextLabel}</span> : null}
          {missing ? <Button variant="ghost" className={styles.attachButton} disabled={running || state.pending} onClick={() => void state.attach()}><Icon name="plus" size={13} /><span>{contextLabel ?? "현재 자료"} 연결</span></Button> : null}
          {!state.conversation?.contexts.length && !contextLabel ? <><Link className={styles.referenceEmpty} href="/jobs"><Icon name="plus" size={12} />공고</Link><Link className={styles.referenceEmpty} href="/career/experience"><Icon name="plus" size={12} />기록</Link></> : null}</div>
        </div>
        {access?.enabled && access.consentRequired ? <div role="alert" className={styles.apiKeyField}><p>채팅을 시작하려면 AI 사용 동의가 필요합니다.</p><small>대화와 연결된 커리어 기록을 AI 모델에 전달합니다.</small><Button variant="outline" onClick={() => setConsentOpen(true)}>AI 사용 동의 확인</Button></div> : null}
        {accessError ? <p role="alert" className={styles.error}>채팅 사용 권한을 확인하지 못했습니다. 새로고침해 주세요.</p> : !access ? <p role="status" className={styles.status}>채팅 사용 권한 확인 중…</p> : !access.enabled ? <p className={styles.status}>에이전트 채팅이 아직 활성화되지 않았습니다.</p> : !access.serverCredentialAllowed && !access.apiKeyConfigured ? <div className={styles.apiKeyField}><p>Anthropic API 키를 등록하면 채팅을 시작할 수 있습니다.</p><Link href="/account#ai-chat-settings">설정에서 API 키 등록</Link></div> : null}
        <div className={styles.thread}><Thread autoFocus={standalone} components={{ Welcome: ChatWelcome, AssistantHeader: AssistantIdentity, ToolFallback: RecordTool, ToolGroup: ExpandedTools, ComposerHeader: ComposerTarget, UserMessageHeader: UserMessageTarget }} /></div>
        <div className={styles.footnote}><Icon name="check-circle" size={12} /><span>{page ? "지면 고침은 바로 새 판으로 저장되고 카드에서 되돌릴 수 있습니다." : "기록의 변경은 확인 후 적용됩니다."}</span></div>
        {lastRun?.status === "cancelled" ? <div role="status" className={`${styles.status} ${styles.runNotice}`}><span>응답을 중지했습니다.</span>{retryButton}</div> : null}
        {lastRun?.error ? <div role="alert" className={`${styles.error} ${styles.runNotice}`}><span>{lastRun.error}</span>{retryButton}</div> : null}
        {state.issue ? <p role="alert" className={styles.error}>{state.issue}</p> : null}
      </div>
      {standalone ? <ConversationSwitcher contexts={state.conversation?.contexts ?? []} contextDisabled={contextDisabled} onToggleContext={toggleContext} onPreview={setPreview} inline currentId={state.id} conversations={state.list} disabled={state.pending} onSelect={state.select} /> : null}
    </section>
  </AssistantRuntimeProvider></PageContext.Provider></JobContext.Provider></ChatContext.Provider>;
}
