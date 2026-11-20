"use client";

import type { ConsultantDiagnosis, ConsultantMemory, ConsultantStage } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { DiagnosisCard } from "@/features/agent-chat/DiagnosisCard";

import { removePreferenceAction, setStageAction } from "./goal-actions";
import styles from "./goal.module.css";

/** 구직 단계의 이름과 뜻. 순서는 구직이 흘러가는 순서다. */
export const STAGES: readonly { value: ConsultantStage; label: string; description: string }[] = [
  { value: "exploring", label: "탐색", description: "하고 싶은 일을 정하는 중" },
  { value: "preparing", label: "준비", description: "목표를 두고 경험과 역량을 쌓는 중" },
  { value: "applying", label: "지원", description: "지원할 공고를 고르고 포트폴리오를 만드는 중" },
];
const STAGE_SOURCE = { agent: "컨설턴트가 대화에서 판단한 단계입니다. 다르면 직접 골라 주세요.", user: "직접 고른 단계입니다." } as const;

/**
 * 컨설턴트가 기억하는 것 — 지금 단계, 목표 진단, 하기로 한 일, 조건, 최근 대화.
 *
 * 구직 목표 아래에 놓인다. 단계는 고르는 즉시 저장하고, 조건은 지우는 즉시 지운다.
 * `conversations`의 날짜는 서버가 서울 날짜로 만들어 넘긴다 — 브라우저의 시간대로 다시 계산하지 않는다.
 */
export function ProgressSections({ memory, diagnosis, commitments, conversations }: {
  memory: Pick<ConsultantMemory, "stage" | "stageSource" | "preferences">;
  /** 저장된 목표 진단. 아직 진단하지 않았으면 null. */
  diagnosis: ConsultantDiagnosis | null;
  /** 열린 약속. `due`는 서버가 만든 날짜 글이고, `href`는 그 약속을 잡은 대화다. */
  commitments: { id: string; title: string; due: string; overdue: boolean; href: string | null }[];
  conversations: { id: string; title: string; date: string; outcomes: string[] }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ error?: string }>) => startTransition(async () => { setError(null); const result = await action(); if (result.error) setError(result.error); });
  return (
    <div className={styles.progress}>
      <section className={styles.section} aria-labelledby="progress-stage">
        <h2 id="progress-stage" className={styles.sectionTitle}>지금 단계</h2>
        <p className={styles.sectionHint}>{memory.stageSource ? STAGE_SOURCE[memory.stageSource] : "아직 정해지지 않았습니다. 대화하면 컨설턴트가 판단하고, 직접 골라도 됩니다."}</p>
        <ul className={styles.stages} role="radiogroup" aria-labelledby="progress-stage">
          {STAGES.map(stage => {
            const selected = memory.stage === stage.value;
            return (
              <li key={stage.value}>
                <button type="button" role="radio" aria-checked={selected} data-selected={selected || undefined} className={styles.stageOption} disabled={pending} onClick={() => { if (!selected) run(() => setStageAction(stage.value)); }}>
                  <span className={styles.mark} aria-hidden="true">{selected ? <Icon name="check" size={12} /> : null}</span>
                  <span className={styles.stageText}><span className={styles.stageLabel}>{stage.label}</span><span className={styles.stageDescription}>{stage.description}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={styles.section} aria-labelledby="progress-diagnosis">
        <h2 id="progress-diagnosis" className={styles.sectionTitle}>목표 진단</h2>
        {diagnosis
          ? <div className={styles.diagnosis}><DiagnosisCard diagnosis={diagnosis} /></div>
          : <p className={styles.empty}>아직 진단하지 않았습니다. 대화에서 「내 목표에 비해 부족한 점을 진단해 줘」라고 말하면 목표와 같은 직군의 공고를 세어 여기에 남깁니다.</p>}
      </section>
      <section className={styles.section} aria-labelledby="progress-commitments">
        <h2 id="progress-commitments" className={styles.sectionTitle}>하기로 한 일</h2>
        {commitments.length ? (
          <ul className={styles.rows}>
            {commitments.map(item => {
              const body = <><span className={styles.rowText}>{item.title}</span>{item.overdue ? <span className={styles.kind} data-kind="avoid">지남</span> : null}<span className={styles.date}>{item.due}까지</span></>;
              return <li key={item.id}>{item.href ? <Link href={item.href as Route} className={`${styles.row} ${styles.rowLink}`}>{body}</Link> : <span className={styles.row}>{body}</span>}</li>;
            })}
          </ul>
        ) : <p className={styles.empty}>아직 하기로 한 일이 없습니다. 대화에서 무엇을 언제까지 하겠다고 말하면 여기에 남습니다. 먼저 연락받기를 켜 두면 그날 홈에서 여쭙니다.</p>}
      </section>
      <section className={styles.section} aria-labelledby="progress-preferences">
        <h2 id="progress-preferences" className={styles.sectionTitle}>컨설턴트가 기억하는 조건</h2>
        {memory.preferences.length ? (
          <ul className={styles.rows}>
            {memory.preferences.map(item => (
              <li key={item.id} className={styles.row}>
                <span className={styles.kind} data-kind={item.kind}>{item.kind === "avoid" ? "피함" : "원함"}</span>
                <span className={styles.rowText}>{item.text}</span>
                <button type="button" className={styles.remove} disabled={pending} aria-label={`${item.text} 지우기`} onClick={() => run(() => removePreferenceAction(item.id))}>지우기</button>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>아직 기억하는 조건이 없습니다. 대화에서 원하거나 피하는 조건을 말하면 여기에 남습니다.</p>}
      </section>
      <section className={styles.section} aria-labelledby="progress-conversations">
        <h2 id="progress-conversations" className={styles.sectionTitle}>최근 대화</h2>
        {conversations.length ? (
          <ul className={styles.rows}>
            {conversations.map(item => (
              <li key={item.id}>
                <Link href={`/home?chat=${item.id}`} className={styles.conversation}>
                  <span className={styles.conversationHead}><span className={styles.rowText}>{item.title}</span><span className={styles.date}>{item.date}</span></span>
                  {item.outcomes.length ? <span className={styles.outcomes}>{item.outcomes.map((line, index) => <span key={index}>{line}</span>)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>아직 대화가 없습니다.</p>}
      </section>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
