"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { ConsultantDiagnosis, DiagnosisStatus } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import card from "./ToolCard.module.css";
import styles from "./DiagnosisCard.module.css";

/** 상태의 모양. 확인됨 · 일부 · 미확인은 요건 대조 카드와 같은 아이콘을 쓴다 — 같은 판정이 두 카드에서 같은 모양이다. */
const STATUS: Record<DiagnosisStatus, { icon: string; weight: "fill" | "regular"; label: string; tone: string | undefined }> = {
  confirmed: { icon: "check-circle", weight: "fill", label: "확인됨", tone: card.strong },
  partial: { icon: "warning-circle", weight: "fill", label: "일부", tone: card.partial },
  unconfirmed: { icon: "circle-dashed", weight: "regular", label: "미확인", tone: styles.muted },
  gap: { icon: "x-circle", weight: "fill", label: "부족", tone: card.unconfirmed },
};
/** 경력 연차의 줄. 상태가 아니라 참고다. */
const REFERENCE = { icon: "info", weight: "regular" as const, label: "참고", tone: styles.muted };
const ORDER: readonly DiagnosisStatus[] = ["confirmed", "partial", "unconfirmed", "gap"];
const KIND = { technology: "기술", experience: "경험", career: "경력", qualification: "자격" } as const;
const EMPTY: Record<DiagnosisStatus, string> = {
  confirmed: "", partial: "",
  unconfirmed: "기록에서 근거를 찾지 못했습니다. 해 본 적이 있으면 대화에서 알려 주세요.",
  gap: "해 본 적이 없다고 답한 항목입니다.",
};
const STALE = { goal: "목표가 바뀌어 다시 진단해야 합니다", records: "진단 뒤에 기록이 바뀌었습니다" } as const;

/** 표본을 한 줄로. 무엇을 몇 건 세었는지가 건수의 뜻을 정한다. */
export function sampleLine(diagnosis: Pick<ConsultantDiagnosis, "family" | "work" | "focus" | "level" | "sampleSize" | "companyCount" | "interestedCount">) {
  const scope = diagnosis.family ? `${diagnosis.family} 공고` : `「${diagnosis.work}」로 찾은 공고`;
  return [
    `${scope} ${diagnosis.sampleSize}건(회사 ${diagnosis.companyCount}곳)`,
    diagnosis.focus ? `${diagnosis.focus}가 나온 공고만` : null,
    diagnosis.level ? "신입 · 경력 2년 이하 공고만" : null,
    diagnosis.interestedCount ? `관심 공고 ${diagnosis.interestedCount}건 포함` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * 목표 진단 카드 — 구직 목표와 같은 직군의 공고에 자주 나오는 것과, 그것이 내 기록에서 확인되는지.
 *
 * 줄마다 요건의 이름, 그 표현이 나온 공고의 수(표본 가운데 몇 건), 상태를 보인다. 누르면 근거 기록의 인용이 펼쳐진다.
 * 건수는 「그 표현이 나온 공고의 수」다. 대화의 답변 아래와 「내 진행」 화면이 같은 카드를 쓴다.
 */
export function DiagnosisCard({ diagnosis }: { diagnosis: ConsultantDiagnosis }) {
  const [open, setOpen] = useState<string | null>(null);
  // 경력 연차는 공고가 받는 경력의 분포다. 기록과 대조하는 항목이 아니라 상태를 세지도, 보이지도 않는다.
  const counts = ORDER.map(status => [status, diagnosis.items.filter(item => item.kind !== "career" && item.status === status).length] as const);
  return <section className={`${card.card} ${styles.card}`} aria-label="목표 진단">
    <header className={card.head}>
      <span className={card.title}><Icon name="chart-bar" size={15} />목표 진단</span>
      {diagnosis.stale ? <span className={card.stale} role="status"><Icon name="arrows-clockwise" size={12} />{STALE[diagnosis.stale]}</span> : null}
    </header>
    <p className={styles.sample}>{sampleLine(diagnosis)}</p>
    {diagnosis.small ? <p className={styles.small} role="note">표본이 5건보다 적습니다. 건수만으로 판단하기 어렵습니다.</p> : null}
    {diagnosis.summary ? <p className={card.summary}>{diagnosis.summary}</p> : null}
    {diagnosis.assessedAt
      ? <div className={card.counts}>{counts.map(([status, count]) => <span key={status} className={`${card.count} ${STATUS[status].tone ?? ""}`}><Icon name={STATUS[status].icon} weight={STATUS[status].weight} size={12} />{STATUS[status].label} {count}</span>)}</div>
      : <p className={styles.small}>아직 기록과 대조하지 않았습니다.</p>}
    <ul className={card.items}>{diagnosis.items.map(item => {
      const reference = item.kind === "career";
      const state = reference ? REFERENCE : STATUS[item.status];
      const expanded = open === item.id;
      const ratio = diagnosis.sampleSize ? Math.min(1, item.count / diagnosis.sampleSize) : 0;
      return <li key={item.id} className={card.item}>
        <button type="button" className={card.itemHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}>
          <Icon name={state.icon} weight={state.weight} size={15} className={state.tone} />
          <span className={card.requirement}>{item.label}<span className={styles.kind}>{KIND[item.kind]}</span></span>
          <span className={styles.frequency} title={`표본 ${diagnosis.sampleSize}건 가운데 ${item.count}건에 나옵니다`}>
            <span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
            <span className={styles.count}>{item.count}/{diagnosis.sampleSize}건</span>
          </span>
          <span className={styles.status} data-status={reference ? "reference" : item.status}>{state.label}</span>
        </button>
        {expanded ? <div className={card.detail}>
          {reference ? null : item.evidence.map(evidence => <div key={`${evidence.recordId}:${evidence.quote}`} className={card.evidence}>
            <Link href={`/career/records/${evidence.recordId}` as Route}><Icon name="notebook" size={12} />{evidence.recordTitle}</Link>
            <q>{evidence.quote}</q>
          </div>)}
          {item.note && !reference ? <p>{item.note}</p> : null}
          {reference ? <p>공고가 받는 경력입니다. 기록과 대조하지 않습니다.</p> : item.evidence.length === 0 && !item.note ? <p>{EMPTY[item.status]}</p> : null}
        </div> : null}
      </li>;
    })}</ul>
    {diagnosis.items.length === 0 ? <p className={styles.small}>이 목표로는 셀 수 있는 공고가 없었습니다.</p> : null}
  </section>;
}

/** 진단을 적는 동안의 자리. 저장하지 못했을 때는 아무것도 그리지 않는다(에이전트가 고쳐 다시 저장한다). */
export function DiagnosisPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">기록과 대조한 결과를 정리하고 있습니다.</p>;
}
