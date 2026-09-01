"use client";
import type { CareerViewRendererProps } from "./view-types";
import { displayValue, keyboardActivate, propertyKey, rawValue } from "./view-types";
import styles from "./views.module.css";

export function TableView(props: CareerViewRendererProps) {
  return <div className={styles.table} role="grid" aria-label="커리어 테이블"><div className={styles.tableHead} role="row"><span role="columnheader">선택</span><span role="columnheader">제목</span>{props.view.visiblePropertyIds.slice(0, 3).map((id) => <span role="columnheader" key={id}>{propertyKey(props.category, id) ?? id.slice(0, 8)}</span>)}</div>{props.records.map((record) => <div className={record.id === props.activeId ? styles.rowActive : styles.tableRow} role="row" key={record.id} tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onDoubleClick={() => props.onActivate(record.id)}><span role="gridcell"><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /></span><button type="button" role="gridcell" onClick={() => props.onActivate(record.id)}>{record.title || "제목 없음"}</button>{props.view.visiblePropertyIds.slice(0, 3).map((id) => { const key = propertyKey(props.category, id); return <span role="gridcell" key={id}>{key ? displayValue(rawValue(record, key)) : ""}</span>; })}</div>)}</div>;
}
