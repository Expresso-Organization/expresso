"use client";

import type { CareerCategory, CareerRecord, CareerRecordListItem } from "@expresso/contracts";

import { propertyOptions } from "../properties/property-editors";
import type { CareerViewRendererProps } from "./view-types";
import { displayValue, keyboardActivate, propertyKey, rawValue } from "./view-types";
import styles from "./views.module.css";

const COVER_BARS = [18, 30, 24, 41, 33, 52, 45, 61, 49, 70, 58, 76, 66, 82];

function plainText(record: CareerRecord): string {
  return record.bodyMd.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
}

function textProperty(record: CareerRecord, key: string, category: CareerCategory): string | null {
  const value = rawValue(record, key, category);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function projectTags(record: CareerRecord, category: CareerCategory): string[] {
  const value = rawValue(record, "technologies", category);
  if (!Array.isArray(value)) return [];
  if (record.propertyValues !== undefined) {
    const definition = category.propertySchemaV2?.find((item) => item.key === "technologies" && item.deletedAt === null);
    const labels = new Map((definition ? propertyOptions(definition) : []).map((option) => [option.id, option.name]));
    return value.flatMap((item) => typeof item === "string" && item !== "" ? [labels.get(item) ?? item] : []).slice(0, 4);
  }
  return value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []).slice(0, 4);
}

function projectPeriod(record: CareerRecord, category: CareerCategory): string {
  if (record.propertyValues !== undefined) {
    const range = rawValue(record, "period", category);
    if (range && typeof range === "object" && "start" in range) {
      const start = String(range.start).slice(0, 7).replace("-", ".");
      return "end" in range && range.end ? start + " – " + String(range.end).slice(0, 7).replace("-", ".") : start + " –";
    }
    return "기간 미입력";
  }
  const item = record as CareerRecord & Pick<CareerRecordListItem, "periodFrom" | "periodTo">;
  const format = (value: string) => value.slice(0, 7).replace("-", ".");
  if (item.periodFrom && item.periodTo) return `${format(item.periodFrom)} – ${format(item.periodTo)}`;
  if (item.periodFrom) return `${format(item.periodFrom)} –`;
  return "기간 미입력";
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
  const missingOutcome = props.records.filter((record) => !textProperty(record, "outcome", props.category));
  return (
    <section className={styles.projectGalleryRegion} aria-label="프로젝트 갤러리 영역">
      <ul className={styles.projectGallery} aria-label="커리어 갤러리">
        {props.records.map((record, index) => {
          const summary = plainText(record);
          const tags = projectTags(record, props.category);
          const outcome = textProperty(record, "outcome", props.category);
          return (
            <li key={record.id}>
              <article className={record.id === props.openId ? styles.projectCardActive : styles.projectCard}>
                <label className={styles.projectSelect}>
                  <input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} />
                  <span>선택</span>
                </label>
                <button className={styles.projectOpen} type="button" tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onClick={() => props.onActivate(record.id)}>
                  <ProjectCover index={index} ai={record.origin === "ai"} />
                  <span className={styles.projectBody}>
                    <strong className={styles.projectTitle}>{record.title || "제목 없음"}</strong>
                    <span className={styles.projectSummary}>{summary || "내용을 채워 주세요."}</span>
                    <span className={styles.projectTags}>{tags.map((tag) => <small key={tag}>{tag}</small>)}</span>
                    <span className={styles.projectMeta}>
                      <small>{projectPeriod(record, props.category)}</small>
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
  return <ul className={styles.gallery} aria-label="커리어 갤러리">{props.records.map((record) => { const preview=props.view.visiblePropertyIds.flatMap((id)=>{const key=propertyKey(props.category,id);return key&&key!=="title"?[displayValue(rawValue(record,key,props.category))]:[]}).filter((value)=>value!=="—").slice(0,3); return <li key={record.id}><article className={record.id === props.openId ? styles.cardActive : styles.card} tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)}><div className={styles.cover} aria-hidden="true"><span>{record.title.slice(0, 1) || "E"}</span><small>{props.category.name}</small></div><label><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /> 선택</label><button type="button" onClick={() => props.onActivate(record.id)}><strong>{record.title || "제목 없음"}</strong><span className={styles.cardSummary}>{plainText(record).slice(0,100)||"내용을 채워 주세요."}</span><span className={styles.cardTags}>{preview.map((item)=><small key={item}>{item}</small>)}</span></button></article></li>})}</ul>;
}

export function GalleryView(props: CareerViewRendererProps) {
  return props.category.key === "project" ? <ProjectGallery {...props} /> : <GenericGallery {...props} />;
}
