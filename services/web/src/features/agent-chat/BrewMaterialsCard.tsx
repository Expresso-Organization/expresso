"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { AgentBrewMaterials } from "@expresso/contracts";
import { beginInterviewAction } from "@/app/(app)/brew/[brewId]/brew-actions";
import { BeginInterviewButton } from "@/app/(app)/brew/[brewId]/materials/BeginInterviewButton";
import { Skel } from "@/components/shell/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { BrewMaterialsCardResponseSchema, type BrewMaterialsCardData } from "@/lib/brew-materials-card";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";
import card from "./RecordDraftCard.module.css";
import styles from "./BrewMaterialsCard.module.css";

async function request(brewId: string, recordIds?: string[]): Promise<BrewMaterialsCardData> {
  const response = await fetch(`/api/brews/${brewId}/materials`, { ...(recordIds ? { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordIds }) } : {}), cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "재료를 불러오지 못했습니다.");
  return BrewMaterialsCardResponseSchema.parse(payload).data;
}

/**
 * 대화의 「재료 고르기」 카드.
 *
 * 기록은 제작을 만들 때 이미 공고에 맞춰 줄 세워져 있다. 이 카드가 하는 일은 그 순서를 보이고 어디까지 담을지를 정하는 것이다.
 * 대화에는 제작 ID만 있고, 목록과 고른 것은 지금의 재료 고르기 화면과 같은 API로 읽고 저장한다 — 두 화면에서 고른 것이 서로 보인다.
 * 고른 목록은 통째로 보낸다. AI를 부르지 않는다.
 * 다음 단계(AI 대화)와 제작 모드 · 정렬은 아직 지금의 화면이 맡는다.
 * 제작이 다음 단계로 넘어간 뒤에도 카드는 대화에 남는다. 그때는 고른 것을 보이기만 하고, 제작이 이어지는 화면으로 가는 링크만 둔다(`resumePath`).
 */
export function BrewMaterialsCard({ materials: { brewId } }: { materials: AgentBrewMaterials }) {
  const [data, setData] = useState<BrewMaterialsCardData | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    request(brewId)
      .then(next => { if (alive) { setData(next); setChosen(new Set(next.materials.materials.filter(row => row.selected).map(row => row.recordId))); } })
      .catch(error => { if (alive) setNotice(error instanceof Error ? error.message : "재료를 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [brewId]);

  const limit = data?.materials.selectionLimit ?? 0;
  const rows = data?.materials.materials ?? [];
  const top = Math.max(...rows.map(row => row.score), 1);

  const toggle = async (recordId: string) => {
    if (data?.resumePath) return;
    const next = new Set(chosen);
    if (next.has(recordId)) next.delete(recordId);
    else if (next.size >= limit) { setNotice(`한 번에 ${limit}건까지 담을 수 있습니다. 빼고 다시 골라 주세요.`); return; }
    else next.add(recordId);
    const before = chosen;
    setChosen(next); setNotice(null); setSaving(true);
    try { setData(await request(brewId, [...next])); }
    // 저장하지 못했으면 누르기 전으로 되돌린다. 화면이 저장되지 않은 것을 고른 것처럼 보이면 안 된다.
    catch (error) { setChosen(before); setNotice(error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };

  const locked = !!data?.resumePath;
  const next = chosen.size === 0 ? "기록 없이 계속" : "AI와 대화 시작";
  return <section className={card.card} aria-label="재료 고르기">
    <header className={`${card.head} ${styles.head}`}>
      <Icon name="list-checks" size={15} /><span>재료 고르기</span>
      {data ? <span className={styles.count} aria-live="polite">고른 기록 <strong>{chosen.size}</strong> / {limit}</span> : null}
    </header>
    {!data && !notice ? <div className={styles.loading} role="status" aria-label="기록을 불러오는 중">{[72, 58, 66, 44].map(width => <Skel key={width} w={`${width}%`} h={14} />)}</div> : null}
    {data && rows.length === 0 ? <p className={card.done}>공고에 맞춰 줄 세울 정리된 기록이 없습니다.</p> : null}
    {rows.length > 0 ? <ul className={styles.rows}>
      {rows.map(row => {
        const selected = chosen.has(row.recordId);
        return <li key={row.recordId}>
          <label className={styles.row} data-selected={selected} data-locked={locked}>
            <input type="checkbox" checked={selected} disabled={saving || locked} onChange={() => void toggle(row.recordId)} />
            <span className={styles.text}>
              <span className={styles.title}>{row.title}</span>
              <span className={styles.meta}><Icon name={CAREER_CATEGORY_ICONS[row.categoryKey] ?? "file-text"} size={11} />{row.categoryName}</span>
            </span>
            <span className={styles.match} role="img" aria-label={`매칭 ${row.score}`}><span style={{ width: `${Math.round((row.score / top) * 100)}%` }} /></span>
          </label>
        </li>;
      })}
    </ul> : null}
    {notice ? <p role="alert" className={card.error}>{notice}</p> : null}
    {data ? <div className={`${card.actions} ${styles.actions}`}>
      {data.resumePath ? <span /> : <Link className={styles.wide} href={`/brew/${brewId}/materials` as Route}><Icon name="arrows-out-simple" size={12} />넓게 보기</Link>}
      {data.resumePath ? <Link className={styles.next} href={data.resumePath as Route}>이어서 만들기</Link> : data.beginsInterview ? <form action={beginInterviewAction}>
        <input type="hidden" name="brewId" value={brewId} />
        {data.basisJobId ? <input type="hidden" name="basisJobId" value={data.basisJobId} /> : null}
        <BeginInterviewButton className={styles.next} saving={saving}>{next}</BeginInterviewButton>
      </form> : <Link className={styles.next} href={`/brew/${brewId}/counter` as Route}>{next}</Link>}
    </div> : null}
  </section>;
}
