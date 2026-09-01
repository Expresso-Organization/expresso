"use client";
import type { CareerViewRendererProps } from "./view-types";
import { keyboardActivate } from "./view-types";
import styles from "./views.module.css";
export function GalleryView(props: CareerViewRendererProps) { return <ul className={styles.gallery} aria-label="커리어 갤러리">{props.records.map((record) => <li key={record.id}><article className={record.id === props.activeId ? styles.cardActive : styles.card} tabIndex={record.id === props.activeId ? 0 : -1} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)}><div className={styles.cover} aria-hidden="true">{record.title.slice(0, 1) || "E"}</div><label><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /> 선택</label><button type="button" onClick={() => props.onActivate(record.id)}><strong>{record.title || "제목 없음"}</strong><small>{record.status}</small></button></article></li>)}</ul>; }
