"use client";

import type { CareerCategory, CareerRecordListItem, CareerRecordSummary, CareerViewType } from "@expresso/contracts";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

import panelStyles from "./DocumentPanel.module.css";
import styles from "./page.module.css";

const BLURB: Record<string, string> = {
  experience: "대화로 꺼낸 순간들을 문서로 관리합니다. 직접 쓰거나, 바리스타에게 질문을 받아 채울 수 있습니다.",
  project: "만든 것과 그 결과를 모읍니다. 성과 수치가 있으면 포트폴리오에 그대로 쓰입니다.",
  education_history: "시간 순서가 중요한 기록입니다. 재직 중인 이력은 타임라인에서 진행 중으로 표시됩니다.",
  certification_award: "발급 기관과 취득일, 증빙까지 한 곳에 둡니다.",
  academic_writing: "논문과 글은 외부 지표까지 함께 봅니다. 어떤 문단이 포트폴리오로 갔는지도 남습니다.",
  activity_leadership: "조직에서 맡은 역할과 규모를 남깁니다.",
  skill_tool: "직접 고르지 않아도 됩니다. 기록에 등장한 도구를 세어 자동으로 채웠습니다.",
};
const VIEWS: Record<string, readonly CareerViewType[]> = {
  experience: ["table", "board", "timeline"], project: ["gallery", "table", "timeline"],
  education_history: ["timeline", "table", "gallery"], certification_award: ["table", "gallery"],
  academic_writing: ["list", "timeline"], activity_leadership: ["table", "timeline"], skill_tool: ["board", "table"],
};
const LABEL: Record<CareerViewType, string> = { table: "테이블", gallery: "갤러리", timeline: "타임라인", board: "보드", list: "목록" };

export function LegacyCareerBrowser({ category, records, summary }: { category: CareerCategory; records: readonly CareerRecordListItem[]; summary: CareerRecordSummary }) {
  const views = VIEWS[category.key] ?? ["table"];
  const [view, setView] = useState<CareerViewType>(views.includes(category.defaultView) ? category.defaultView : views[0]!);
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? null);
  const selected = records.find((record) => record.id === selectedId) ?? null;
  return <div data-career-editor="legacy" className={styles.legacyLayout}>
    <main className={styles.list} aria-label="기존 커리어 목록">
      <div className={styles.categoryHead}><span className={styles.categoryIcon}><Icon name="archive" size={18} /></span><h1 className={styles.categoryName}>{category.name}</h1></div>
      <p className={styles.categoryBlurb}>{BLURB[category.key] ?? "이 카테고리의 기록입니다."}</p>
      <div className={styles.viewBar}>{views.map((item) => <button key={item} type="button" className={`${styles.viewTab} ${item === view ? styles.viewTabActive : ""}`} onClick={() => setView(item)}>{LABEL[item]}</button>)}<div className={styles.viewBarRight}><button type="button" className={styles.viewBarAction}>필터</button><button type="button" className={styles.viewBarAction}>정렬</button><button type="button" className={styles.viewBarAction}>속성</button></div></div>
      {records.length ? <div className={styles.table} role="grid" aria-label="기존 커리어 테이블"><div className={`${styles.row} ${styles.headRow}`} role="row"><span className={styles.headCell} role="columnheader">제목</span><span className={styles.headCell} role="columnheader">상태</span><span className={styles.headCell} role="columnheader">기간</span><span className={styles.headCell} role="columnheader">출처</span><span className={styles.headCell} role="columnheader">사용처</span><span /></div>{records.map((record) => <button key={record.id} type="button" role="row" className={`${styles.row} ${styles.bodyRow} ${record.id === selectedId ? styles.bodyRowSelected : ""}`} onClick={() => setSelectedId(record.id)}><span className={styles.titleCell} role="gridcell">{record.title || "제목 없음"}</span><span className={styles.cell} role="gridcell">{record.status === "draft" ? "초안" : record.status === "verified" ? "검증됨" : "정리됨"}</span><span className={styles.cell} role="gridcell">{record.periodFrom?.slice(0, 7) ?? "—"}</span><span className={styles.cell} role="gridcell">{record.origin === "manual" ? "직접 작성" : "AI"}</span><span className={styles.cell} role="gridcell">{record.usedInCount}곳</span><span /></button>)}</div> : <div className={styles.empty}><p className={styles.emptyTitle}>아직 기록이 없습니다</p><p className={styles.emptyBody}>기존 기록 API와 Markdown 입력 화면을 유지하고 있습니다.</p></div>}
      <div className={styles.summary}><span className={styles.summaryText}>{summary.total}개 · 초안 {summary.draft} · 비어 있음 {summary.empty}</span></div>
    </main>
    <aside className={panelStyles.panel} data-open={selected ? "true" : "false"} aria-label="기존 문서 패널"><div className={panelStyles.head}><span className={panelStyles.headLabel}>기존 Markdown 문서</span></div>{selected ? <div className={panelStyles.body}><h2 className={panelStyles.title}>{selected.title || "제목 없음"}</h2><div className={panelStyles.properties}>{Object.entries(selected.properties).map(([key, value]) => <div className={panelStyles.propertyRow} key={key}><span className={panelStyles.propertyLabelText}>{key}</span><span className={panelStyles.propertyValue}>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span></div>)}</div><div className={panelStyles.divider} /><p className={panelStyles.blockText}>{selected.bodyMd || "본문이 비어 있습니다."}</p></div> : <div className={panelStyles.none}><p className={panelStyles.noneText}>기록을 선택하세요.</p></div>}</aside>
  </div>;
}
