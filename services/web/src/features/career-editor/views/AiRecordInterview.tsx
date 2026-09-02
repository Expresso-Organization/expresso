"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./AiRecordInterview.module.css";

type Question = { key: "title" | "role" | "action" | "result" | "evidence"; label: string; help: string; placeholder: string; suggestions: string[] };

const CREATE_QUESTIONS: Question[] = [
  { key: "title", label: "어떤 경험을 기록할까요?", help: "프로젝트나 경험을 알아볼 수 있는 이름이면 충분합니다.", placeholder: "예: 결제 정산 스케줄러 재설계", suggestions: [] },
  { key: "role", label: "어떤 역할을 맡았나요?", help: "직책보다 실제로 책임진 범위를 알려 주세요.", placeholder: "맡은 역할을 직접 적어 주세요", suggestions: ["직접 구현", "기술 리드", "협업·조율", "분석·기획"] },
  { key: "action", label: "무엇을 바꾸거나 해결했나요?", help: "문제와 핵심 행동을 한두 문장으로 적어 주세요.", placeholder: "예: 수동 재처리 흐름을 멱등한 큐 구조로 전환", suggestions: [] },
  { key: "result", label: "어떤 결과가 달라졌나요?", help: "확인된 수치나 관찰된 변화를 입력합니다. 아직 측정 전이어도 괜찮습니다.", placeholder: "예: 월 1,200만 건을 안정적으로 처리", suggestions: ["수치로 확인됨", "품질 개선", "시간 절감", "아직 측정 전"] },
];

const FILL_QUESTIONS: Question[] = [
  { key: "result", label: "이 경험 뒤에 무엇이 달라졌나요?", help: "사용자, 팀, 시스템에 생긴 변화를 적어 주세요.", placeholder: "확인된 결과를 적어 주세요", suggestions: ["품질 개선", "시간 절감", "비용 절감", "아직 측정 전"] },
  { key: "evidence", label: "결과를 확인한 근거가 있나요?", help: "지표, 로그, 사용자 반응처럼 확인 가능한 근거를 남깁니다.", placeholder: "예: 장애 재발 0건, 처리 시간 40% 감소", suggestions: ["운영 지표", "사용자 반응", "팀 회고", "근거 없음"] },
  { key: "action", label: "그 결과를 만든 핵심 행동은 무엇인가요?", help: "본인이 한 일을 중심으로 적어 주세요.", placeholder: "핵심 행동을 적어 주세요", suggestions: [] },
];

export interface AiInterviewResult { title: string; bodyMd: string; prompt: string }

export function AiRecordInterview({ mode, categoryName, recordTitle = "", onCancel, onComplete }: {
  mode: "create" | "fill";
  categoryName: string;
  recordTitle?: string;
  onCancel(): void;
  onComplete(result: AiInterviewResult): void;
}) {
  const questions = mode === "create" ? CREATE_QUESTIONS : FILL_QUESTIONS;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const question = questions[step]!;
  const answer = answers[question.key] ?? "";

  useEffect(() => inputRef.current?.focus(), [step]);

  function finish(nextAnswers: Record<string, string>) {
    const title = mode === "create" ? (nextAnswers.title ?? "").trim() : recordTitle;
    const lines = [
      nextAnswers.role ? `## 역할\n${nextAnswers.role}` : "",
      nextAnswers.action ? `## 핵심 행동\n${nextAnswers.action}` : "",
      nextAnswers.result ? `## 성과\n${nextAnswers.result}` : "",
      nextAnswers.evidence ? `## 근거\n${nextAnswers.evidence}` : "",
    ].filter(Boolean);
    const facts = Object.entries(nextAnswers).filter(([, value]) => value.trim()).map(([key, value]) => `${key}: ${value.trim()}`).join("\n");
    onComplete({
      title,
      bodyMd: lines.join("\n\n"),
      prompt: `다음 사용자가 제공한 내용만 사용해 ${categoryName} 기록을 STAR 흐름으로 정리해 주세요. 확인되지 않은 내용은 추정하지 말고 비워 두세요.\n${facts}`,
    });
  }

  function advance(skip = false) {
    const nextAnswers = skip ? { ...answers, [question.key]: "" } : answers;
    if (step === questions.length - 1) finish(nextAnswers);
    else setStep((current) => current + 1);
  }

  return <div className={styles.backdrop} role="presentation" onKeyDown={(event) => {
    if (event.key === "Escape") { onCancel(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? [])];
    if (!focusable.length) return;
    const first = focusable[0]!; const last = focusable.at(-1)!;
    if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <section ref={cardRef} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="career-ai-question">
      <header>
        <div><span className={styles.eyebrow}>EXPRESSO AI · {step + 1}/{questions.length}</span><strong>{mode === "create" ? "기록 시작하기" : `${recordTitle || categoryName} 보완하기`}</strong></div>
        <button type="button" aria-label="AI 질문 닫기" onClick={onCancel}><Icon name="x" size={15} /></button>
      </header>
      <div className={styles.progress} aria-hidden="true"><span style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      <div className={styles.question}>
        <h2 id="career-ai-question">{question.label}</h2>
        <p>{question.help}</p>
        {question.suggestions.length ? <div className={styles.suggestions}>{question.suggestions.map((suggestion) => <button key={suggestion} type="button" aria-pressed={answer === suggestion} onClick={() => setAnswers((current) => ({ ...current, [question.key]: suggestion }))}>{suggestion}</button>)}</div> : null}
        <label><span>직접 입력</span><input ref={inputRef} aria-label={question.label} value={answer} placeholder={question.placeholder} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && answer.trim()) advance(); }} /></label>
      </div>
      <footer>
        <button type="button" onClick={() => advance(true)}>건너뛰기</button>
        <span>{step + 1} / {questions.length}</span>
        <button type="button" disabled={!answer.trim()} onClick={() => advance()}>{step === questions.length - 1 ? "AI 제안 준비" : "다음"}</button>
      </footer>
    </section>
  </div>;
}
