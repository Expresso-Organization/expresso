"use client";
import type { CareerViewRendererProps } from "./view-types";
import { displayValue, keyboardActivate, propertyKey, propertyName, rawValue } from "./view-types";
import styles from "./views.module.css";

export function TableView(props: CareerViewRendererProps) {
  const columns=props.view.visiblePropertyIds.filter((id)=>propertyKey(props.category,id)!=="title").slice(0,3);
  return <div className={styles.table} role="grid" aria-label="커리어 테이블"><div className={styles.tableHead} role="row"><span role="columnheader">선택</span><span role="columnheader">제목</span>{columns.map((id) => <span role="columnheader" key={id}>{propertyName(props.category,id)}</span>)}</div>{props.records.map((record) => <div className={record.id === props.openId ? styles.rowActive : styles.tableRow} role="row" key={record.id} tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onDoubleClick={() => props.onActivate(record.id)}><span role="gridcell"><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /></span><button type="button" role="gridcell" onClick={() => props.onActivate(record.id)}>{record.title || "제목 없음"}</button>{columns.map((id) => { const key = propertyKey(props.category, id); return <span role="gridcell" key={id}>{key ? displayValue(rawValue(record, key)) : ""}</span>; })}</div>)}</div>;
}
