"use client";
import { createContext, useContext, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { useRouter } from "next/navigation";
import { AssistantRuntimeProvider, useExternalStoreRuntime, useAui, useAuiState, type ThreadMessageLike, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { AgentChatAccessSchema, AgentApiKeySchema } from "@expresso/contracts";
import type { AgentContext, AgentMessage, AiEditProposalDetail, CareerDocumentBootstrap } from "@expresso/contracts";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { AiProposalDiff } from "@/features/career-editor/ai/AiProposalDiff";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { ToolGroupRoot, ToolGroupContent, ToolGroupTrigger } from "@/components/assistant-ui/elements/tool-group.aui";
import { Button } from "@/components/ui/button";
import type { ThreadGroupPart } from "@/components/assistant-ui/elements/thread.aui";
import type { PropsWithChildren } from "react";
import "@/styles/agent-chat-framework.css";
import { useAgentConversation } from "./useAgentConversation";
import styles from "./AgentChat.module.css";

/** 프레임워크 원본 Thread를 사용하고 도메인 도구의 승인 화면만 확장합니다. */
const ChatContext = createContext<ReturnType<typeof useAgentConversation> | null>(null);
function AssistantIdentity() {
  const running = useAuiState(s => s.message.status?.type === "running");
  return <div className={styles.identity}><LogoMark size={20} /><span>Expresso AI</span>{running ? <span className={styles.working}>함께 살펴보는 중</span> : null}</div>;
}
const STARTERS = [
  { icon: "target", title: "공고와 경험 비교", description: "이 기회에 맞는 내 경험 찾기", prompt: "연결한 공고의 요구사항과 내 커리어 기록을 비교해 줘." },
  { icon: "chat-circle-dots", title: "경험 구체화", description: "역할과 성과를 질문으로 정리", prompt: "내 커리어 기록에서 역할·행동·성과가 부족한 부분을 질문해 줘." },
  { icon: "pencil-line", title: "기록 다듬기", description: "더 잘 읽히는 문장으로 제안", prompt: "연결한 기록의 문장을 다듬는 변경 제안을 만들어 줘." },
];
function ChatWelcome() {
  const runtime = useAui();
  const welcome = useRef<HTMLDivElement>(null);
  return <div ref={welcome} className={styles.welcome}>
    <div className={styles.welcomeMark}><LogoMark size={44} /></div>
    <span className={styles.eyebrow}>내 기록에서, 다음 기회까지</span>
    <h1>내 경험을,<br /><span>다음 기회로.</span></h1>
    <p>관심 있는 공고와 커리어 기록을 연결해 주세요.<br />어떤 경험을 보여줄지 함께 정리합니다.</p>
    <div className={styles.starters}>{STARTERS.map(item => <Button key={item.title} variant="ghost" className={styles.starter} onClick={() => { runtime.thread.composer().setText(item.prompt); welcome.current?.closest(".aui-thread-root")?.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus(); }}><Icon name={item.icon} size={19} /><strong>{item.title}</strong><span>{item.description}</span><Icon name="arrow-up-right" size={14} /></Button>)}</div>
  </div>;
}
const RecordTool: ToolCallMessagePartComponent = props => {
  const state = useContext(ChatContext)!;
  const tool = state.conversation?.messages.flatMap(message => message.tools).find(tool => tool.id === props.toolCallId);
  return <ToolFallback.Root defaultOpen className={styles.toolCard}><ToolFallback.Trigger toolName={tool?.name ?? props.toolName} status={props.status} /><ToolFallback.Content>
    <p className={styles.toolSummary}>{tool?.summary}</p>
    {tool?.proposal ? <Proposal proposal={tool.proposal} beforeDocument={tool.beforeDocument} undone={tool.undone} /> : null}
  </ToolFallback.Content></ToolFallback.Root>;
};
function ExpandedTools({ group, children }: PropsWithChildren<{ group: ThreadGroupPart }>) {
  return <ToolGroupRoot variant="ghost" defaultOpen><ToolGroupTrigger count={group.indices.length} active={group.status.type === "running"} /><ToolGroupContent>{children}</ToolGroupContent></ToolGroupRoot>;
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
  content: [
    ...message.tools.map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name, args: {}, argsText: "{}", ...(tool.status === "running" ? {} : { result: { summary: tool.summary }, isError: tool.status === "failed" }) })),
    { type: "text", text: message.text },
  ],
});
export function AgentChat({ context, contextLabel, standalone = false }: { context?: AgentContext; contextLabel?: string; standalone?: boolean }) {
  const state = useAgentConversation(context);
  const [access, setAccess] = useState<ReturnType<typeof AgentChatAccessSchema.parse>["data"] | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [apiKey, setApiKey] = useState("");
  useEffect(() => { const controller = new AbortController(); void fetch("/api/agent/access", { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("access"); setAccess(AgentChatAccessSchema.parse(await response.json()).data); }).catch(() => { if (!controller.signal.aborted) setAccessError(true); }); return () => controller.abort(); }, []);
  const canSend = !!access?.enabled && (access.serverCredentialAllowed || AgentApiKeySchema.safeParse(apiKey).success);
  const running = state.conversation?.run?.status === "running";
  const runtime = useExternalStoreRuntime({ messages: state.conversation?.messages ?? [], convertMessage, isRunning: running, isLoading: !!state.id && !state.conversation, isDisabled: !canSend || state.pending || (!!state.id && !state.conversation), onNew: async message => { const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n"); try { await state.send(text, access?.serverCredentialAllowed ? undefined : apiKey); } catch { runtime.thread.composer.setText(text); } }, onCancel: state.cancel });
  const missing = context && state.conversation && !state.conversation.contexts.some(ref => ref.kind === context.kind && ref.id === context.id);
  return <ChatContext.Provider value={state}><AssistantRuntimeProvider runtime={runtime}>
    <section className={`acf-scope ${styles.root} ${standalone ? styles.standalone : styles.panel}`} aria-label="에이전트 채팅">
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.heading}><span className={styles.assistantMark}><LogoMark size={22} /></span><div><strong>{state.conversation?.title ?? "새 대화"}</strong><span>{running ? "답변을 준비하고 있어요" : "Expresso AI"}</span></div></div>
          <div className={styles.headerActions}><span className={standalone ? styles.compactHistory : undefined}><ConversationSwitcher currentId={state.id} conversations={state.list} disabled={state.pending} onSelect={state.select} /></span>{!standalone ? <Link aria-label="독립 채팅으로 크게 열기" title="크게 열기" href={{ pathname: "/agent", query: state.id ? { chat: state.id } : {} }}><Icon name="arrows-out-simple" size={17} /></Link> : null}<Button variant="ghost" size="icon" aria-label="새 대화" title="새 대화" disabled={state.pending} onClick={() => state.select(null)}><Icon name="note-pencil" size={18} /></Button></div>
        </header>

        <div className={styles.contexts} aria-label="대화에 연결된 자료">
          <span className={styles.contextLabel}><Icon name="paperclip" size={14} />함께 보는 자료</span>
          <div className={styles.referenceItems}>{state.conversation?.contexts.map((ref, index) => <Link className={styles.reference} data-kind={ref.kind} key={`${ref.kind}:${ref.id}`} href={(ref.kind === "job" ? `/jobs/${ref.id}?chat=${state.id}` : `/career/records/${ref.id}?chat=${state.id}`) as never}><Icon name={ref.kind === "job" ? "target" : "notebook"} size={14} /><span>{context?.id === ref.id && contextLabel ? contextLabel : `${ref.kind === "job" ? "채용 공고" : "커리어 기록"} ${index + 1}`}</span><Icon name="arrow-up-right" size={11} /></Link>)}
          {!state.id && contextLabel ? <span className={styles.reference} data-kind={context?.kind}><Icon name={context?.kind === "job" ? "target" : "notebook"} size={14} />{contextLabel}</span> : null}
          {missing ? <Button variant="ghost" className={styles.attachButton} disabled={running || state.pending} onClick={() => void state.attach()}><Icon name="plus" size={13} /><span>{contextLabel ?? "현재 자료"} 연결</span></Button> : null}
          {!state.conversation?.contexts.length && !contextLabel ? <><Link className={styles.referenceEmpty} href="/jobs"><Icon name="plus" size={12} />공고</Link><Link className={styles.referenceEmpty} href="/career/experience"><Icon name="plus" size={12} />기록</Link></> : null}</div>
        </div>
        {accessError ? <p role="alert" className={styles.error}>채팅 사용 권한을 확인하지 못했습니다. 새로고침해 주세요.</p> : !access ? <p role="status" className={styles.status}>채팅 사용 권한 확인 중…</p> : !access.enabled ? <p className={styles.status}>에이전트 채팅이 아직 활성화되지 않았습니다.</p> : !access.serverCredentialAllowed ? <div className={styles.apiKeyField}><label>Anthropic API 키<input aria-label="Anthropic API 키" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value.trim())} placeholder="sk-ant-…" /></label><small>본인 API 키로 Sonnet을 사용합니다. 키는 저장하지 않으며 이 화면을 떠나면 지워집니다. API 이용료는 입력한 키의 계정에 청구됩니다.</small></div> : null}
        <div className={styles.thread}><Thread autoFocus={standalone} components={{ Welcome: ChatWelcome, AssistantHeader: AssistantIdentity, ToolFallback: RecordTool, ToolGroup: ExpandedTools }} /></div>
        <div className={styles.footnote}><Icon name="check-circle" size={12} /><span>기록의 변경은 확인 후 적용됩니다.</span></div>
        {state.conversation?.run?.status === "cancelled" ? <p role="status" className={styles.status}>응답을 중지했습니다.</p> : null}
        {state.conversation?.run?.error ? <p role="alert" className={styles.error}>{state.conversation.run.error}</p> : null}
        {state.issue ? <p role="alert" className={styles.error}>{state.issue}</p> : null}
      </div>
      {standalone ? <ConversationSwitcher inline currentId={state.id} conversations={state.list} disabled={state.pending} onSelect={state.select} /> : null}
    </section>
  </AssistantRuntimeProvider></ChatContext.Provider>;
}
