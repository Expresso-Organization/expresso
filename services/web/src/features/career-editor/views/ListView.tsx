"use client";
import type { CareerViewRendererProps } from "./view-types";
import { keyboardActivate } from "./view-types";
import styles from "./views.module.css";
export function ListView(props: CareerViewRendererProps) { return <ul className={styles.list} aria-label="커리어 목록">{props.records.map((record) => <li key={record.id}><button type="button" tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onClick={() => props.onActivate(record.id)}><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onClick={(event) => event.stopPropagation()} onChange={() => props.onToggle(record.id)} /><span><strong>{record.title || "제목 없음"}</strong><small>{record.status} · {new Date(record.updatedAt).toLocaleDateString("ko-KR")}</small></span></button></li>)}</ul>; }
