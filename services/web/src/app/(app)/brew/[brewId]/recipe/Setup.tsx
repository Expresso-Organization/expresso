"use client";

import type { PortfolioIntent, RecipeV2, RecipeV2JobPosting } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";

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
  /** 공고 요건과 겹친 말. 겹친 것이 없으면 빈 배열이다 — 그 줄의 칸은 비운다. */
  matchedTerms: string[];
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
 * 분류별 분포 막대의 칸 색. 정의서 01b 「고른 재료 n건」 카드의 회색 계단이다 —
 * 많은 분류가 진하고, 다섯째부터는 가장 옅은 칸을 함께 쓴다.
 */
const SWATCHES = ["var(--ex-fg)", "var(--ex-fg-muted)", "var(--ex-fg-subtle)", "var(--ex-fg-faint)", "var(--ex-border)"];

/**
 * 레시피를 만들기 전에 고르는 것.
 *
 * 무엇을 겨냥하고 무엇을 쓸지만 고른다. 짜는 일은 「레시피 만들기」 뒤에 AI가
 * 하고, 사용자가 하는 일은 나온 것을 고치는 일이다.
 *
 * 두 칸이다(정의서 01b) — 왼쪽은 공고와 기록 표, 오른쪽은 이번에 짜는 재료의
 * 요약과 제작 의도, 그리고 만들기 버튼이다.
 */
export function Setup({
  brewId,
  recipe,
  records,
  designName,
  previousJobId,
  failureNote,
  draftAction,
}: {
  brewId: string;
  recipe: RecipeV2;
  records: SetupRecord[];
  designName: string | null;
  /** 직전 시도의 잡. 「다시 짜기」가 새 잡이 되는 근거가 이것이다. */
  previousJobId: string | null;
  /** 직전 시도가 거절됐으면 그 이유. */
  failureNote: string | null;
  draftAction: (formData: FormData) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>(records.filter(({ selected }) => selected).map(({ recordId }) => recordId));
  const [posting, setPosting] = useState<RecipeV2JobPosting | null>(recipe.jobPosting);
  const [intent, setIntent] = useState<PortfolioIntent>(recipe.intent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 이미 레시피가 있을 때, 새 초안으로 바꾼다는 것을 확인받는 단계. */
  const [armed, setArmed] = useState(false);

  /** 이미 짠 레시피가 있다 — 「다시 짜기」다. */
  const redraft = recipe.sections.length > 0;
  const full = chosen.length >= LIMIT;

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

  /** 분류별로 몇 건 골랐는가. 많은 것부터. */
  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (!chosen.includes(record.recordId)) continue;
      counts.set(record.categoryName, (counts.get(record.categoryName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [records, chosen]);

  return (
    <div className={styles.setup}>
      <form action={submit} className={styles.layout}>
        <input type="hidden" name="brewId" value={brewId} />
        {/*
          * 이 시도를 가리키는 값.
          *
          * 레시피 id를 쓰면 안 된다 — 새 초안을 물려받아도 **그 id는 그대로**라
          * 멱등성 키가 영영 같고, 한 번 만든 뒤로 「레시피 만들기」는 이미 끝난
          * 잡을 돌려받는 죽은 버튼이 된다. 실제로 그랬다.
          */}
        <input type="hidden" name="previousJobId" value={previousJobId ?? ""} />

        <div className={styles.main}>
          <header className={styles.head}>
            <h1>{redraft ? "레시피 다시 짜기" : "레시피 만들기"}</h1>
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
                <Icon name="target" size={16} />
                <span>
                  <strong>{posting.title}</strong>
                  {posting.companyName}
                </span>
                <button type="button" className={styles.ghostButton} onClick={() => saveIntent({ ...intent, jobPostingId: null })}>
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
                <Icon name="magnifying-glass" size={14} /> 공고 탐색에서 고르기
              </Link>
              <button type="button" className={styles.ghostButton} onClick={() => setPickerOpen(true)}>
                <Icon name="clipboard-text" size={14} /> 공고 붙여넣기
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
              /*
               * 화면 정의서 05 「내 커리어」의 표. 맨 앞 칸만 고르기로 바뀐다.
               * 「순위 이유」는 공고가 있을 때만 있다 — 공고가 없으면 순위를 매길
               * 근거가 없고, 그걸 열 줄에 걸쳐 적는 것은 빈 말이다.
               */
              <div className={table.table}>
                <div className={`${styles.row} ${table.headRow}`} data-ranked={posting ? "1" : undefined}>
                  <div className={table.headCell}>
                    <Icon name="check-square" size={13} color="var(--ex-fg-muted)" />
                    <span className={table.headLabel}>쓸 기록</span>
                  </div>
                  <div className={table.headCell}>
                    <Icon name="circle-half" size={13} color="var(--ex-fg-muted)" />
                    <span className={table.headLabel}>상태</span>
                  </div>
                  <div className={table.headCell}>
                    <Icon name="tag" size={13} color="var(--ex-fg-muted)" />
                    <span className={table.headLabel}>분류</span>
                  </div>
                  <div className={table.headCell}>
                    <Icon name="calendar-blank" size={13} color="var(--ex-fg-muted)" />
                    <span className={table.headLabel}>시기</span>
                  </div>
                  {posting ? (
                    <div className={table.headCell}>
                      <Icon name="target" size={13} color="var(--ex-fg-muted)" />
                      <span className={table.headLabel}>순위 이유</span>
                    </div>
                  ) : null}
                </div>

                {records.map((record) => {
                  const on = chosen.includes(record.recordId);
                  const ai = record.origin === "ai" || record.origin === "interview";
                  return (
                    <label
                      key={record.recordId}
                      className={`${styles.row} ${table.bodyRow} ${on ? table.bodyRowSelected : ""}`}
                      data-ranked={posting ? "1" : undefined}
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
                        <Icon name={record.categoryIcon} size={15} color="var(--ex-fg-muted)" />
                        <span className={`${table.recordTitle} ${styles.recordTitle}`}>{record.title}</span>
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
                      {posting ? <span className={`${table.cell} ${styles.reason}`}>{record.matchedTerms.join(" · ")}</span> : null}
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── 오른쪽 · 이번에 짜는 재료 ───────────────────────── */}
        <aside className={styles.summary}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>이번에 짜는 재료</h2>

            <div className={styles.stat}>
              <span>고른 기록</span>
              <b data-full={full ? "1" : undefined}>{chosen.length} <em>/ {LIMIT}</em></b>
            </div>
            {distribution.length > 0 ? (
              <>
                <div className={styles.bar} aria-hidden="true">
                  {distribution.map(({ name, count }, index) => (
                    <span
                      key={name}
                      style={{ flex: count, background: SWATCHES[Math.min(index, SWATCHES.length - 1)] }}
                    />
                  ))}
                </div>
                <ul className={styles.legend}>
                  {distribution.map(({ name, count }, index) => (
                    <li key={name}>
                      <i style={{ background: SWATCHES[Math.min(index, SWATCHES.length - 1)] }} aria-hidden="true" />
                      <span>{name}</span>
                      <b>{count}</b>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={styles.cardNote}>고른 기록이 없습니다. 기록 없이 짜면 제작 의도만으로 초안을 만듭니다.</p>
            )}
            {full ? <p className={styles.cardNote}>{LIMIT}건까지 고를 수 있습니다.</p> : null}

            <dl className={styles.facts}>
              <div>
                <dt><Icon name="target" size={13} /> 지원할 공고</dt>
                <dd>{posting ? <><b>{posting.companyName}</b> · {posting.title}</> : "없음 · 기록만으로"}</dd>
              </div>
              <div>
                <dt><Icon name="palette" size={13} /> 디자인</dt>
                <dd>{designName ?? <Link href={`/brew/${brewId}/design` as Route}>아직 없음 · 고르러 가기</Link>}</dd>
              </div>
            </dl>

            <div className={styles.intent}>
              <h3>제작 의도 <span>선택 사항 · 적으면 그 방향으로 짭니다</span></h3>
              <label>
                <span>보여주고 싶은 역할 · 분야</span>
                <input
                  defaultValue={intent.role}
                  maxLength={200}
                  placeholder="예: 결제 플랫폼 백엔드"
                  onBlur={(event) => { const role = event.target.value.trim(); if (role !== intent.role) void saveIntent({ ...intent, role }); }}
                />
              </label>
              <label>
                <span>주요 독자</span>
                <input
                  defaultValue={intent.audience}
                  maxLength={200}
                  placeholder="예: 채용 담당자 · 실무 리드"
                  onBlur={(event) => { const audience = event.target.value.trim(); if (audience !== intent.audience) void saveIntent({ ...intent, audience }); }}
                />
              </label>
              <label>
                <span>원하는 분량</span>
                <select
                  value={intent.lengthPreset}
                  onChange={(event) => void saveIntent({ ...intent, lengthPreset: event.target.value as PortfolioIntent["lengthPreset"] })}
                >
                  <option value="single">짧게 · 한 장</option>
                  <option value="double">보통 · 두 장</option>
                  <option value="triple">길게 · 세 장</option>
                </select>
              </label>
              <label>
                <span>가장 강조할 경험</span>
                <textarea
                  defaultValue={intent.highlight}
                  maxLength={1_000}
                  rows={1}
                  placeholder="비워 두면 고른 기록만으로 짭니다."
                  onBlur={(event) => { const highlight = event.target.value.trim(); if (highlight !== intent.highlight) void saveIntent({ ...intent, highlight }); }}
                />
              </label>
              <label>
                <span>추가 요청</span>
                <textarea
                  defaultValue={intent.extraRequest}
                  maxLength={2_000}
                  rows={1}
                  placeholder="담고 싶은 내용이나 순서에 바라는 것이 있으면 적어 주세요."
                  onBlur={(event) => { const extraRequest = event.target.value.trim(); if (extraRequest !== intent.extraRequest) void saveIntent({ ...intent, extraRequest }); }}
                />
              </label>
            </div>

            <div className={styles.foot}>
              {redraft && armed ? (
                <p className={styles.warning} role="alert">
                  지금 레시피 {recipe.sections.length}섹션이 새 초안으로 바뀝니다. 고친 내용은 사라집니다.
                </p>
              ) : null}
              {/*
                * 두 버튼은 **다른 노드**여야 한다(`key`). 같은 자리의 한 노드로 두면
                * React 가 누르는 순간 `type` 을 submit 으로 바꾸고, 브라우저는 클릭의
                * 기본 동작을 그 뒤에 정하므로 확인 단계 없이 폼이 나간다. 실제로 그랬다.
                */}
              {redraft && !armed ? (
                <button
                  key="arm"
                  type="button"
                  className={styles.primary}
                  onClick={(event) => { event.preventDefault(); setArmed(true); }}
                >
                  <Icon name="sparkle" size={15} /> 다시 짜기
                </button>
              ) : (
                <button key="go" type="submit" className={styles.primary} disabled={busy}>
                  {busy ? "짜는 중" : <><Icon name="sparkle" size={15} /> {redraft ? "새 초안으로 바꾸기" : "레시피 만들기"}</>}
                </button>
              )}
              {redraft && armed ? (
                <button type="button" className={styles.ghostButton} onClick={() => setArmed(false)} disabled={busy}>
                  취소
                </button>
              ) : null}
              {/* 실측 144초 · 158초(기록 10건 · sonnet). 다음 화면이 적는 값과 같아야 한다. */}
              <span className={styles.footNote}>2~3분 걸립니다. 이 화면을 닫아도 계속됩니다.</span>
            </div>
          </div>
        </aside>
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
