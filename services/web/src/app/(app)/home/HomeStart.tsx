"use client";

import { AgentChatAccessSchema, type AgentContext } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { putAgentHandoff } from "@/features/agent-chat/agent-handoff";
import { ResourceList, type ResourceKind } from "@/features/agent-chat/ResourceList";
import "@/styles/agent-chat-framework.css";

import type { BriefingAction } from "./briefing";
import styles from "./home-start.module.css";

const CONTEXT_ICON: Record<AgentContext["kind"], string> = { job: "target", record: "notebook", portfolio: "browsers" };
/** 한 대화에 연결할 수 있는 자료 수(계약 `CreateAgentConversationSchema`). */
const MAX_CONTEXTS = 10;
const PICKER_TABS: readonly { kind: ResourceKind; label: string }[] = [
  { kind: "records", label: "기록" },
  { kind: "jobs", label: "공고" },
  { kind: "portfolios", label: "포트폴리오" },
];

type Attached = { context: AgentContext; label: string };
type Fill = (prompt: string, context?: AgentContext, label?: string) => void;
const ComposerContext = createContext<Fill | null>(null);

/**
 * 입력창 아래의 추천 프롬프트. 에이전트에게 맡길 수 있는 일을 짧은 이름으로 세우고,
 * 누르면 그 요청문을 입력창에 채운다. 자료를 연결하지 않아도 시작할 수 있는 요청만 둔다.
 */
const PROMPTS: readonly { icon: string; label: string; prompt: string }[] = [
  { icon: "note-pencil", label: "새 기록 남기기", prompt: "내 경험을 기록으로 남기고 싶어. 한 번에 하나씩 질문해 주고, 답을 모아 새 기록 초안을 만들어 줘." },
  { icon: "chat-circle-dots", label: "경험 구체화", prompt: "내 커리어 기록에서 역할 · 행동 · 성과가 부족한 부분을 질문해 줘." },
  { icon: "target", label: "맞는 공고 찾기", prompt: "내 커리어 기록과 잘 맞는 채용 공고를 찾아 줘. 왜 맞는지 기록의 근거와 함께 알려 줘." },
  { icon: "compass", label: "목표 직무 탐색", prompt: "아직 목표 공고가 없어. 내 경험과 관심사를 물어보고 맞는 직무 후보를 같이 찾아 줘." },
];

/**
 * 홈 — 대화를 시작하기 전의 화면.
 *
 * 위에서 아래로 로고, 입력창, 추천 프롬프트, 행동 제안, 새 소식 위젯이 선다.
 * 입력창은 대화를 만들지 않는다. 보낼 말과 연결할 자료를 대화 화면으로 넘기고 그리로 간다.
 */
export function HomeStart({ proposals, widgets }: { proposals: ReactNode; widgets: ReactNode }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<Attached[]>([]);
  // 입력창을 누르면 pill이 둥근 사각형으로 펴지고 도구 줄이 나타난다. 쓴 것이 남아 있으면 접지 않는다.
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState<ResourceKind | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const wrap = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const expanded = focused || picker !== null || text.length > 0 || attached.length > 0;

  // 지금 대화에 쓰이는 모델. 서버가 알려 주는 값을 그대로 보인다.
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent/access", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? AgentChatAccessSchema.parse(await response.json()).data.model : null))
      .then(setModel)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // 바깥을 누르면 접는다. blur만 보면 놓친다 — 자료 칩을 지우면 초점을 가진 단추가 사라져 blur가 오지 않는다.
  useEffect(() => {
    if (!focused) return;
    const leave = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setFocused(false); };
    document.addEventListener("mousedown", leave);
    return () => document.removeEventListener("mousedown", leave);
  }, [focused]);

  // 자료 고르는 창은 바깥을 누르거나 Escape를 누르면 닫힌다.
  useEffect(() => {
    if (!picker) return;
    const close = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setPicker(null); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setPicker(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [picker]);

  const fill = useCallback<Fill>((prompt, context, label) => {
    setText(prompt);
    // 제안은 그 제안의 자료 하나로 바꾸고, 추천 프롬프트는 이미 붙인 자료를 건드리지 않는다.
    if (context) setAttached([{ context, label: label ?? "" }]);
    input.current?.focus();
  }, []);

  const toggle = (context: AgentContext, label: string) =>
    setAttached((current) => {
      const has = current.some((item) => item.context.kind === context.kind && item.context.id === context.id);
      if (has) return current.filter((item) => item.context.kind !== context.kind || item.context.id !== context.id);
      return current.length >= MAX_CONTEXTS ? current : [...current, { context, label }];
    });

  const send = () => {
    const value = text.trim();
    if (!value) return;
    putAgentHandoff({ text: value, contexts: attached.map((item) => item.context) });
    router.push("/home?compose=1" as Route);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); send(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중의 Enter는 글자를 확정하는 키다.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  const blur = (event: FocusEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  return (
    <ComposerContext.Provider value={fill}>
      <div className={styles.stage}>
        <div className={styles.column}>
          <div className={styles.hero}>
            <div className={styles.brand}>
              <LogoMark size={46} />
              <Wordmark size={38} />
            </div>
            <form ref={wrap} className={styles.composerWrap} onSubmit={submit} onFocus={() => setFocused(true)} onBlur={blur}>
              <div className={styles.composer} data-expanded={expanded}>
                {attached.length > 0 ? (
                  <div className={styles.attachedRow}>
                    {attached.map(({ context, label }) => (
                      <span key={`${context.kind}:${context.id}`} className={styles.attached}>
                        <Icon name={CONTEXT_ICON[context.kind]} size={13} />
                        <span className={styles.attachedLabel}>{label}</span>
                        <button type="button" className={styles.attachedRemove} aria-label={`${label} 연결 해제`} onClick={() => toggle(context, label)}>
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <Icon name="sparkle" size={18} color="var(--ex-accent-text)" className={styles.composerMark} />
                <textarea
                  ref={input}
                  className={styles.input}
                  rows={1}
                  value={text}
                  placeholder="무엇을 함께 할까요?"
                  aria-label="에이전트에게 보낼 말"
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={keyDown}
                />
                <div className={styles.tools}>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-expanded={picker !== null}
                    title="기록 · 공고 · 포트폴리오를 대화에 연결"
                    onClick={() => setPicker((current) => (current ? null : "records"))}
                  >
                    <Icon name="plus" size={14} />
                    자료 추가
                  </button>
                  {/* 메시지 계약에 첨부 자리가 없다(`SendAgentMessageSchema`). 서버가 받게 되면 연다. */}
                  <button type="button" className={styles.tool} disabled title="파일 첨부는 아직 지원하지 않습니다">
                    <Icon name="paperclip" size={14} />
                    파일
                  </button>
                  {/* 모델은 서버 설정 하나로 정해진다. 고를 수 있게 되면 메뉴를 연다. */}
                  {model ? (
                    <button type="button" className={`${styles.tool} ${styles.toolModel}`} disabled title="모델 선택은 아직 지원하지 않습니다">
                      {model.slice(0, 1).toUpperCase() + model.slice(1)}
                      <Icon name="caret-down" size={11} />
                    </button>
                  ) : null}
                </div>
                <button type="submit" className={styles.send} aria-label="보내기" disabled={!text.trim()}>
                  <Icon name="arrow-up" weight="bold" size={16} />
                </button>
              </div>
              {picker ? (
                <div className={`acf-scope ${styles.picker}`} role="dialog" aria-label="대화에 연결할 자료">
                  <div className={styles.pickerTabs} role="tablist">
                    {PICKER_TABS.map((tab) => (
                      <button key={tab.kind} type="button" role="tab" aria-selected={picker === tab.kind} className={styles.pickerTab} onClick={() => setPicker(tab.kind)}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <ResourceList
                    key={picker}
                    kind={picker}
                    contexts={attached.map((item) => item.context)}
                    disabled={false}
                    onToggle={toggle}
                    onPreview={(resource) => toggle({ kind: resource.kind, id: resource.id }, resource.title)}
                  />
                </div>
              ) : null}
            </form>
            <div className={styles.prompts}>
              {PROMPTS.map((item) => (
                <button key={item.label} type="button" className={styles.prompt} onClick={() => fill(item.prompt)}>
                  <Icon name={item.icon} size={14} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {proposals}
          {widgets}
        </div>
      </div>
    </ComposerContext.Provider>
  );
}

/** 제안의 동작. 대화를 여는 동작은 요청문과 자료를 가운데 입력창에 채우고, 나머지는 그 화면으로 간다. */
export function ProposalAction({ action }: { action: BriefingAction }) {
  const fill = useContext(ComposerContext);
  if (action.kind === "link") {
    return (
      <Link href={action.href as Route} className={styles.proposalAction}>
        {action.label}
        <Icon name="arrow-right" size={12} />
      </Link>
    );
  }
  return (
    <button type="button" className={styles.proposalAction} onClick={() => fill?.(action.prompt, action.context, action.contextLabel)}>
      <Icon name="chat-circle-dots" size={13} />
      {action.label}
    </button>
  );
}
