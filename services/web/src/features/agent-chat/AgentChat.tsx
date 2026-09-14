"use client";
import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessageLike, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { AgentContext, AgentMessage, AiEditProposalDetail, CareerDocumentBootstrap } from "@expresso/contracts";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";
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
const RecordTool: ToolCallMessagePartComponent = props => {
  const state = useContext(ChatContext)!;
  const tool = state.conversation?.messages.flatMap(message => message.tools).find(tool => tool.id === props.toolCallId);
  return <ToolFallback.Root defaultOpen><ToolFallback.Trigger toolName={tool?.name ?? props.toolName} status={props.status} /><ToolFallback.Content>
    <p>{tool?.summary}</p>
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
    <p>{undone ? "변경을 되돌렸습니다." : proposal.status === "applied" ? "기록에 적용했습니다." : proposal.status === "ready" ? "검토 후 적용해 주세요." : proposal.status === "rejected" ? "제안을 거절했습니다." : "제안을 더 이상 적용할 수 없습니다."}</p>
    {proposal.status === "ready" ? <div className={styles.actions}><Button variant="outline" disabled={state.pending || state.conversation?.run?.status === "running" || !(commands.size + properties.size)} onClick={() => void state.approve({ proposalId: proposal.proposalId, action: "apply", expectedDocumentVersion: proposal.baseDocumentVersion, commandIndexes: [...commands], propertyChangeIndexes: [...properties] }).then(() => router.refresh())}>선택한 변경 적용</Button><Button variant="outline" disabled={state.pending} onClick={() => void state.approve({ proposalId: proposal.proposalId, action: "reject", expectedDocumentVersion: proposal.baseDocumentVersion })}>거절</Button></div> : null}
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
  const running = state.conversation?.run?.status === "running";
  const runtime = useExternalStoreRuntime({ messages: state.conversation?.messages ?? [], convertMessage, isRunning: running, isLoading: !!state.id && !state.conversation, isDisabled: state.pending || (!!state.id && !state.conversation), onNew: async message => { const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n"); try { await state.send(text); } catch { runtime.thread.composer.setText(text); } }, onCancel: state.cancel });
  const missing = context && state.conversation && !state.conversation.contexts.some(ref => ref.kind === context.kind && ref.id === context.id);
  return <ChatContext.Provider value={state}><AssistantRuntimeProvider runtime={runtime}>
    <section className={`acf-scope ${standalone ? styles.standalone : styles.panel}`} aria-label="에이전트 채팅">
      <header className={styles.header}><strong>에이전트 채팅</strong>{!standalone ? <Link href={{ pathname: "/agent", query: state.id ? { chat: state.id } : {} }}>크게 열기</Link> : null}<Button variant="outline" disabled={state.pending} onClick={() => state.select(null)}>새 대화</Button></header>
      <div className={styles.history}><span>대화 목록</span><PropertySelect label="대화 목록" value={state.id ?? ""} placeholder="새 대화" disabled={state.pending} onChange={value => state.select(value || null)} options={[{ value: "", label: "새 대화" }, ...(state.id && !state.list.some(item => item.id === state.id) ? [{ value: state.id, label: state.conversation?.title ?? "불러오는 중" }] : []), ...state.list.map(item => ({ value: item.id, label: item.title }))]} /></div>
      <div className={styles.contexts}>{state.conversation?.contexts.map((ref, index) => <Link key={`${ref.kind}:${ref.id}`} href={(ref.kind === "job" ? `/jobs/${ref.id}?chat=${state.id}` : `/career/records/${ref.id}?chat=${state.id}`) as never}>{ref.kind === "job" ? "연결된 공고" : "연결된 기록"} {index + 1}</Link>)}{!state.id && contextLabel ? <span>{contextLabel}</span> : null}{missing ? <Button variant="outline" disabled={running || state.pending} onClick={() => void state.attach()}>{contextLabel ?? "현재 자료"} 연결</Button> : null}</div>
      <div className={styles.thread}><Thread autoFocus={standalone} components={{ ToolFallback: RecordTool, ToolGroup: ExpandedTools }} /></div>
      {state.conversation?.run?.status === "cancelled" ? <p role="status" className={styles.status}>응답을 중지했습니다.</p> : null}
      {state.conversation?.run?.error ? <p role="alert" className={styles.error}>{state.conversation.run.error}</p> : null}
      {state.issue ? <p role="alert" className={styles.error}>{state.issue}</p> : null}
    </section>
  </AssistantRuntimeProvider></ChatContext.Provider>;
}
