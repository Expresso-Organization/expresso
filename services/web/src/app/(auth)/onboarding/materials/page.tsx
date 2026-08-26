"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";

/** 이력서를 읽어 기록으로 쪼갠 결과. 확인 후 저장한다. */
const SPLIT = [
  { id: "s1", category: "프로젝트", name: "정산 파이프라인 재설계", period: "2024.03 – 2024.11" },
  { id: "s2", category: "프로젝트", name: "결제 이중화 구축", period: "2023.05 – 2023.09" },
  { id: "s3", category: "경험", name: "커머스 정산팀 · 백엔드 엔지니어", period: "2022 – 현재" },
  { id: "s4", category: "경험", name: "핀테크 스타트업 · 서버 개발", period: "2019 – 2022" },
  { id: "s5", category: "학력·이력", name: "컴퓨터공학 학사", period: "2015 – 2019" },
  { id: "s6", category: "자격증·수상", name: "사내 기술상 · 정산 자동화", period: "2024" },
  { id: "s7", category: "스킬·도구", name: "Kotlin · Spring · Kafka 외 9개", period: "자동 집계" },
];

export default function OnboardingMaterialsPage() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(SPLIT.map((row) => row.id)),
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 정의서의 12건은 스킬 행이 9개를 묶어 세는 결과다.
  const total = selected.size + (selected.has("s7") ? 5 : 0);

  return (
    <OnboardingShell
      step={3}
      wide
      footRight={
        <>
          <Link href="/career/experience" className={styles.ghost}>
            건너뛰고 직접 쓰기
          </Link>
          <Link href="/onboarding/first-portfolio" className={styles.primary}>
            기록 {total}건 만들기
          </Link>
        </>
      }
    >
      <div className={styles.stepLabelMono}>STEP 3 / 4</div>
      <h1 className={styles.title}>재료부터 채웁니다</h1>
      <p className={styles.lede}>
        이력서 한 장이면 충분합니다. 읽어서 기록으로 쪼개 드리고, 부족한 곳은
        나중에 질문으로 채웁니다.
      </p>

      <div className={styles.importGrid}>
        <div className={styles.dropZone}>
          <Icon name="upload-simple" size={22} color="var(--ex-fg-subtle)" />
          <span className={styles.dropTitle}>이력서를 여기에 놓으십시오</span>
          <span className={styles.dropNote}>PDF · DOCX · 최대 10MB</span>
          <div className={styles.uploaded}>
            <Icon name="file-pdf" size={16} color="var(--ex-accent-text)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.uploadedName}>resume_2026.pdf</div>
              <div className={styles.uploadedMeta}>842KB · 방금 업로드</div>
            </div>
            <Icon name="check-circle" weight="fill" size={15} color="var(--ex-status-success)" />
          </div>
        </div>

        <div className={styles.importCard}>
          <Icon name="github-logo" weight="fill" size={18} color="var(--ex-fg-body)" />
          <div style={{ minWidth: 0 }}>
            <div className={styles.importTitle}>GitHub 저장소</div>
            <div className={styles.importNote}>공개 저장소에서 프로젝트를 가져옵니다</div>
          </div>
          <span className={styles.importState}>읽는 중…</span>
        </div>

        <div className={styles.importCard}>
          <Icon name="link-simple" size={18} color="var(--ex-fg-body)" />
          <div style={{ minWidth: 0 }}>
            <div className={styles.importTitle}>링크로 가져오기</div>
            <div className={styles.importNote}>노션 · 블로그 · 발표 자료 주소</div>
          </div>
          <button type="button" className={styles.importAction}>
            연결
          </button>
        </div>
      </div>

      <div className={styles.privacyNote}>
        <Icon name="lock-simple" size={12} />
        올린 파일은 기록을 만드는 데만 쓰이고, 학습에 쓰지 않습니다 ·{" "}
        <Link href={"/onboarding/consent" as Route} className={styles.privacyLink}>동의 다시 보기</Link>
      </div>

      <div className={styles.splitHead}>
        <span className={styles.splitTitle}>이렇게 나눠 담겠습니다</span>
        <span className={styles.splitCount}>{total}건</span>
        <button
          type="button"
          className={styles.splitClear}
          onClick={() => setSelected(new Set())}
        >
          모두 해제
        </button>
      </div>

      <div className={styles.splitList}>
        {SPLIT.map((row) => {
          const on = selected.has(row.id);
          return (
            <button
              key={row.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(row.id)}
              className={styles.splitRow}
            >
              <span
                className={styles.splitCheck}
                style={
                  on
                    ? undefined
                    : { background: "none", border: "1.5px solid var(--ex-border-soft)" }
                }
              >
                {on ? <Icon name="check" size={10} color="var(--ex-fg-on-accent)" /> : null}
              </span>
              <span className={styles.splitCategory}>{row.category}</span>
              <span className={styles.splitName}>{row.name}</span>
              <span className={styles.splitPeriod}>{row.period}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.gapNote}>
        <Icon name="coffee" weight="fill" size={13} color="var(--ex-accent-text)" />
        숫자가 빈 기록 <b>4건</b>은 나중에 질문으로 채웁니다
      </div>
    </OnboardingShell>
  );
}
