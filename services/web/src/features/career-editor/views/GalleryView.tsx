"use client";

import { CareerPropertyValueV2Schema, mediaAssetUrl, type CareerCategory, type CareerRecord } from "@expresso/contracts";
import type { ReactNode } from "react";

import { API_BASE_URL } from "@/lib/api/client";

import type { CareerViewRendererProps } from "./view-types";
import { keyboardActivate, rawValue } from "./view-types";
import { markdownPreview } from "./markdown-preview";
import { activeDefinitions, definitionById, fieldValue, propertyLabel, propertyLabels } from "./view-logic";
import styles from "./views.module.css";

const COVER_BARS = [18, 30, 24, 41, 33, 52, 45, 61, 49, 70, 58, 76, 66, 82];

function plainText(record: CareerRecord): string {
  return markdownPreview(record.bodyMd);
}

function textProperty(record: CareerRecord, key: string): string | null {
  const value = rawValue(record, key);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

/** 기술은 다중 선택이라 옵션 ID로 저장된다. 화면에는 옵션 이름을 보인다. */
function projectTags(record: CareerRecord, category: CareerCategory): string[] {
  const definition = activeDefinitions(category).find((item) => item.key === "technologies");
  return definition ? propertyLabels(record, definition).slice(0, 4) : [];
}

function projectPeriod(record: CareerRecord): string {
  // 기간은 `period` 날짜 속성에 있다. 뷰 응답에는 목록 전용 칸(`periodFrom`)이 없다.
  const parsed = CareerPropertyValueV2Schema.safeParse(record.properties.period);
  const range = parsed.success && parsed.data.type === "date" ? parsed.data.value : null;
  const format = (value: string) => value.slice(0, 7).replace("-", ".");
  if (range?.start && range.end) return `${format(range.start)} – ${format(range.end)}`;
  if (range?.start) return `${format(range.start)} –`;
  return "기간 미입력";
}

/** 뷰 설정 「갤러리 표지」의 내용입니다. 그림 속성이면 첫 그림, 다른 속성이면 그 값입니다. 정하지 않았거나 비었으면 null입니다. */
function galleryCover(record: CareerRecord, props: CareerViewRendererProps): ReactNode | null {
  const coverId = props.view.gallery?.coverPropertyId;
  const definition = coverId ? activeDefinitions(props.category).find((item) => item.id === coverId) : undefined;
  if (!definition) return null;
  if (definition.type === "media" || definition.type === "file") {
    const value = fieldValue(record, definition);
    const first = Array.isArray(value) ? value[0] : null;
    return first ? <img className={styles.coverImage} src={mediaAssetUrl(API_BASE_URL, String(first))} alt="" /> : null;
  }
  const label = propertyLabel(record, definition);
  return label ? <span className={styles.coverText}>{label}</span> : null;
}

function ProjectCover({ index, ai }: { index: number; ai: boolean }) {
  return (
    <div className={styles.projectCover} data-variant={index % 3} aria-hidden="true">
      <div className={styles.projectCoverHead}>
        <span>PROJECT</span>
        <span className={styles.projectCoverDots}><i /><i /><i /></span>
      </div>
      <div className={styles.projectCoverChart}>
        {COVER_BARS.map((height, bar) => <i key={bar} style={{ height: `${Math.max(10, height - (index % 3) * ((bar + 2) % 5))}%` }} />)}
      </div>
      <div className={styles.projectCoverAxis}><span>START</span><span>RESULT</span></div>
      {ai ? <span className={styles.projectAiBadge}>AI 요약됨</span> : null}
    </div>
  );
}

function ProjectGallery(props: CareerViewRendererProps) {
  const missingOutcome = props.records.filter((record) => !textProperty(record, "outcome"));
  return (
    <section className={styles.projectGalleryRegion} aria-label="프로젝트 갤러리 영역">
      <ul className={styles.projectGallery} aria-label="커리어 갤러리">
        {props.records.map((record, index) => {
          const summary = plainText(record);
          const tags = projectTags(record, props.category);
          const outcome = textProperty(record, "outcome");
          return (
            <li key={record.id}>
              <article className={record.id === props.openId ? styles.projectCardActive : styles.projectCard}>
                <label className={styles.projectSelect}>
                  <input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} />
                  <span>선택</span>
                </label>
                <button className={styles.projectOpen} type="button" tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onClick={() => props.onActivate(record.id)}>
                  {(() => { const cover = galleryCover(record, props); return cover ? <div className={styles.projectCover} aria-hidden="true">{cover}</div> : <ProjectCover index={index} ai={record.origin === "ai"} />; })()}
                  <span className={styles.projectBody}>
                    <strong className={styles.projectTitle}>{record.title || "제목 없음"}</strong>
                    <span className={styles.projectSummary}>{summary || "내용을 채워 주세요."}</span>
                    <span className={styles.projectTags}>{tags.map((tag) => <small key={tag}>{tag}</small>)}</span>
                    <span className={styles.projectMeta}>
                      <small>{projectPeriod(record)}</small>
                      <small data-missing={outcome ? "false" : "true"}>{outcome ?? "성과 수치 없음"}</small>
                    </span>
                  </span>
                </button>
              </article>
            </li>
          );
        })}
        <li>
          <button type="button" className={styles.projectAdd} onClick={() => props.onCreate()}>
            <span aria-hidden="true">＋</span>
            <strong>프로젝트 추가</strong>
            <small>또는 AI로 만들기</small>
          </button>
        </li>
      </ul>
      <footer className={styles.projectGalleryFooter}>
        <span>{props.records.length}개 · 성과 수치 없음 {missingOutcome.length}</span>
        <button type="button" disabled={!missingOutcome[0]} onClick={() => missingOutcome[0] && props.onFillMissing(missingOutcome[0].id)}>비어 있는 성과 채우기</button>
      </footer>
    </section>
  );
}

function GenericGallery(props: CareerViewRendererProps) {
  return <ul className={styles.gallery} aria-label="커리어 갤러리">{props.records.map((record) => { const preview=props.view.visiblePropertyIds.flatMap((id)=>{const definition=definitionById(props.category,id);const label=definition&&definition.key!=="title"?propertyLabel(record,definition):null;return label?[label]:[]}).slice(0,3); return <li key={record.id}><article className={record.id === props.openId ? styles.cardActive : styles.card} tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)}><div className={styles.cover} aria-hidden="true">{galleryCover(record, props) ?? <><span>{record.title.slice(0, 1) || "E"}</span><small>{props.category.name}</small></>}</div><label><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /> 선택</label><button type="button" onClick={() => props.onActivate(record.id)}><strong>{record.title || "제목 없음"}</strong><span className={styles.cardSummary}>{plainText(record).slice(0,100)||"내용을 채워 주세요."}</span><span className={styles.cardTags}>{preview.map((item)=><small key={item}>{item}</small>)}</span></button></article></li>})}</ul>;
}

export function GalleryView(props: CareerViewRendererProps) {
  return props.category.key === "project" ? <ProjectGallery {...props} /> : <GenericGallery {...props} />;
}
