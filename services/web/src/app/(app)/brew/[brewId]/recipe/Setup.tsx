"use client";

import type { PortfolioIntent, RecipeV2, RecipeV2JobPosting } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { JobPostingPicker } from "./JobPostingPicker";
import { editRecipeAction, saveMaterialsAction } from "./recipe-actions";
import table from "@/components/career/record-table.module.css";

import styles from "./Setup.module.css";

export type SetupRecord = {
  recordId: string;
  title: string;
  categoryName: string;
  categoryIcon: string;
  status: "organized" | "verified";
  origin: "manual" | "ai" | "interview" | "import";
  periodFrom: string | null;
  periodTo: string | null;
  selected: boolean;
  /** 순위를 매긴 근거. 공고 요건과 겹친 말이다. */
  reason: string;
};

const STATUS_LABEL = { organized: "정리됨", verified: "확인됨" } as const;

/** 화면 정의서 05 의 「시기」 칸. 모르면 비운다 — 없는 기간을 지어내지 않는다. */
function periodText(record: SetupRecord): string {
  const from = record.periodFrom?.slice(0, 7).replace("-", ".");
  const to = record.periodTo?.slice(0, 7).replace("-", ".");
  if (!from && !to) return "—";
  if (from && to && from !== to) return `${from} – ${to}`;
  return from ?? to ?? "—";
}

/** 고르기 상한. 계약(`UpdateBrewMaterialsSchema`)이 정한 값과 같다. */
const LIMIT = 10;

/**
 * 레시피를 만들기 전에 고르는 것.
 *
 * 무엇을 겨냥하고 무엇을 쓸지만 고른다. 짜는 일은 「레시피 만들기」 뒤에 AI가
 * 하고, 사용자가 하는 일은 나온 것을 고치는 일이다.
 */
export function Setup({
  brewId,
  recipe,
  records,
  designName,
  failureNote,
  draftAction,
}: {
  brewId: string;
  recipe: RecipeV2;
  records: SetupRecord[];
  designName: string | null;
  /** 직전 시도가 거절됐으면 그 이유. */
  failureNote: string | null;
  draftAction: (formData: FormData) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>(records.filter(({ selected }) => selected).map(({ recordId }) => recordId));
  const [posting, setPosting] = useState<RecipeV2JobPosting | null>(recipe.jobPosting);
  const [intent, setIntent] = useState<PortfolioIntent>(recipe.intent);
  const [intentOpen, setIntentOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(recordId: string) {
    setChosen((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : current.length >= LIMIT ? current : [...current, recordId],
    );
  }

  async function saveIntent(next: PortfolioIntent) {
    setIntent(next);
    const result = await editRecipeAction(recipe.id, { operation: "update_intent", intent: next });
    if (!result.ok) setError(result.error);
    else setPosting(result.recipe.jobPosting);
  }

  /** 고른 것을 먼저 저장하고, 그다음에 짜는 일을 건다. */
  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    const saved = await saveMaterialsAction(brewId, chosen);
    if (!saved.ok) {
      setError(saved.error);
      setBusy(false);
      return;
    }
    await draftAction(formData);
  }

  const full = chosen.length >= LIMIT;

  return (
    <div className={styles.setup}>
      <form action={submit} className={styles.sheet}>
        <input type="hidden" name="brewId" value={brewId} />
        <input type="hidden" name="previousRecipeId" value={recipe.id} />

        <header className={styles.head}>
          <h1>레시피 만들기</h1>
          <p>
            무엇을 어떤 순서로 담을지 AI가 먼저 짭니다. 나온 뒤에 직접 고치면 됩니다.
            지면의 모양은 {designName ? <b>{designName}</b> : "고른 디자인"} 안에서 다음 단계가 정합니다.
          </p>
        </header>

        {failureNote ? <p className={styles.failure} role="alert">{failureNote}</p> : null}
        {error ? <p className={styles.failure} role="alert">{error}</p> : null}

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2>지원할 공고</h2>
            <span>선택 사항</span>
          </div>
          {posting ? (
            <div className={styles.posting}>
              <Icon name="target" size={15} color="var(--ex-accent-text)" />
              <span>
                <strong>{posting.title}</strong>
                {posting.companyName}
              </span>
              <button type="button" onClick={() => saveIntent({ ...intent, jobPostingId: null })}>
                비우기
              </button>
            </div>
          ) : (
            <p className={styles.blockNote}>
              공고를 고르면 그 요건에 맞춰 무엇을 앞에 둘지 정합니다. 고르지 않아도
              기록만으로 만듭니다.
            </p>
          )}
          <div className={styles.postingActions}>
            <Link href={`/jobs?pick=${brewId}` as Route} className={styles.ghostButton}>
              <Icon name="magnifying-glass" size={13} /> 공고 탐색에서 고르기
            </Link>
            <button type="button" className={styles.ghostButton} onClick={() => setPickerOpen(true)}>
              <Icon name="clipboard-text" size={13} /> 공고 붙여넣기
            </button>
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2>쓸 기록</h2>
            <span data-full={full ? "1" : undefined}>{chosen.length} / {LIMIT}</span>
          </div>
          {records.length === 0 ? (
            <p className={styles.blockNote}>
              아직 커리어 기록이 없습니다. 기록 없이도 만들 수 있지만, 근거가 붙은
              레시피가 되려면 <Link href={"/career/project" as Route}>기록을 먼저 적어</Link> 주세요.
            </p>
          ) : (
            /* 화면 정의서 05 「내 커리어」의 표. 맨 앞 칸만 고르기로 바뀐다. */
            <div className={table.table}>
              <div className={`${styles.row} ${table.headRow}`}>
                <div className={table.headCell}>
                  <Icon name="check-square" size={12} color="var(--ex-fg-muted)" />
                  <span className={table.headLabel}>쓸 기록</span>
                </div>
                <div className={table.headCell}>
                  <Icon name="circle-half" size={12} color="var(--ex-fg-muted)" />
                  <span className={table.headLabel}>상태</span>
                </div>
                <div className={table.headCell}>
                  <Icon name="tag" size={12} color="var(--ex-fg-muted)" />
                  <span className={table.headLabel}>분류</span>
                </div>
                <div className={table.headCell}>
                  <Icon name="calendar-blank" size={12} color="var(--ex-fg-muted)" />
                  <span className={table.headLabel}>시기</span>
                </div>
                <div className={table.headCell}>
                  <Icon name="target" size={12} color="var(--ex-fg-muted)" />
                  <span className={table.headLabel}>순위 이유</span>
                </div>
              </div>

              {records.map((record) => {
                const on = chosen.includes(record.recordId);
                const ai = record.origin === "ai" || record.origin === "interview";
                return (
                  <label
                    key={record.recordId}
                    className={`${styles.row} ${table.bodyRow} ${on ? table.bodyRowSelected : ""}`}
                    data-off={!on && full ? "1" : undefined}
                  >
                    <span className={table.titleCell}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={on}
                        disabled={!on && full}
                        onChange={() => toggle(record.recordId)}
                      />
                      <Icon name={record.categoryIcon} size={14} color="var(--ex-fg-muted)" />
                      <span className={table.recordTitle}>{record.title}</span>
                      {ai ? <span className={table.aiBadge}>AI</span> : null}
                    </span>
                    <span className={table.cell}>
                      <span className={record.status === "verified" ? table.statusOrganized : table.statusPlain}>
                        {STATUS_LABEL[record.status]}
                      </span>
                    </span>
                    <span className={`${table.cell} ${table.cellTags}`}>
                      <span className={table.tag}>{record.categoryName}</span>
                    </span>
                    <span className={table.cell}>{periodText(record)}</span>
                    <span className={`${table.cell} ${styles.reason}`}>{record.reason}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.block}>
          <button
            type="button"
            className={styles.intentToggle}
            onClick={() => setIntentOpen((open) => !open)}
            aria-expanded={intentOpen}
          >
            <Icon name={intentOpen ? "caret-down" : "caret-right"} size={12} />
            제작 의도
            <span>선택 사항 · 적으면 그 방향으로 짭니다</span>
          </button>
          {intentOpen ? (
            <div className={styles.intentFields}>
              <label>
                <span>보여주고 싶은 역할 · 분야</span>
                <input
                  defaultValue={intent.role}
                  maxLength={200}
                  placeholder="예: 결제 플랫폼 백엔드"
                  onBlur={(event) => saveIntent({ ...intent, role: event.target.value.trim() })}
                />
              </label>
              <label>
                <span>주요 독자</span>
                <input
                  defaultValue={intent.audience}
                  maxLength={200}
                  placeholder="예: 채용 담당자 · 실무 리드"
                  onBlur={(event) => saveIntent({ ...intent, audience: event.target.value.trim() })}
                />
              </label>
              <label>
                <span>원하는 분량</span>
                <select
                  value={intent.lengthPreset}
                  onChange={(event) =>
                    saveIntent({ ...intent, lengthPreset: event.target.value as PortfolioIntent["lengthPreset"] })
                  }
                >
                  <option value="single">짧게 · 한 장</option>
                  <option value="double">보통 · 두 장</option>
                  <option value="triple">길게 · 세 장</option>
                </select>
              </label>
              <label className={styles.wide}>
                <span>가장 강조할 경험</span>
                <textarea
                  defaultValue={intent.highlight}
                  maxLength={1_000}
                  rows={2}
                  placeholder="비워 두면 고른 기록만으로 짭니다."
                  onBlur={(event) => saveIntent({ ...intent, highlight: event.target.value.trim() })}
                />
              </label>
            </div>
          ) : null}
        </section>

        <footer className={styles.foot}>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? "짜는 중" : <><Icon name="sparkle" size={14} /> 레시피 만들기</>}
          </button>
          <span>1분쯤 걸립니다. 이 화면을 닫아도 계속됩니다.</span>
        </footer>
      </form>

      {pickerOpen ? (
        <JobPostingPicker
          current={posting}
          onClose={() => setPickerOpen(false)}
          onPick={(jobPostingId) => {
            setPickerOpen(false);
            void saveIntent({ ...intent, jobPostingId });
          }}
        />
      ) : null}
    </div>
  );
}
