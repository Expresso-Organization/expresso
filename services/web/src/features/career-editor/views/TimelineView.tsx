"use client";

import type { CareerRecord } from "@expresso/contracts";
import { Fragment } from "react";

import { Icon } from "@/components/ui/Icon";

import type { CareerViewRendererProps } from "./view-types";
import { keyboardActivate } from "./view-types";
import { activeDefinitions, formatDate, propertyLabel, timelineRange, withinAxis, type TimelineRange } from "./view-logic";
import styles from "./views.module.css";

/** 시작 날짜 순 세로 시간 축. 해가 바뀌는 자리에 연도 눈금이 선다. */
export function TimelineView(props: CareerViewRendererProps) {
  const ranged: Array<{ record: CareerRecord; range: TimelineRange }> = [];
  const undated: CareerRecord[] = [];
  for (const record of props.records) {
    const range = timelineRange(record, props.view, props.category);
    if (!range) undated.push(record);
    else if (withinAxis(range, props.view)) ranged.push({ record, range });
  }
  if (!props.view.sorts.length) ranged.sort((left, right) => right.range.start.localeCompare(left.range.start) || left.record.id.localeCompare(right.record.id));
  const ordered = [...ranged.map((item) => item.record), ...undated];
  const dateIds = new Set([props.view.timeline?.startPropertyId, props.view.timeline?.endPropertyId]);
  const details = activeDefinitions(props.category).filter((item) => item.type !== "title" && !dateIds.has(item.id) && props.view.visiblePropertyIds.includes(item.id));

  const card = (record: CareerRecord) => <article
    className={record.id === props.openId ? styles.cardActive : styles.card}
    tabIndex={record.id === props.activeId ? 0 : -1}
    onKeyDown={(event) => keyboardActivate(event, record.id, ordered, props.onActivate)}
  >
    <label><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /></label>
    <button type="button" onClick={() => props.onActivate(record.id)}>{record.title || "제목 없음"}</button>
    <div className={styles.timelineMeta}>{details.flatMap((definition) => { const label = propertyLabel(record, definition); return label ? [<small key={definition.id}>{label}</small>] : []; }).slice(0, 3)}</div>
  </article>;

  return <div className={styles.timelineRegion}>
    <ol className={styles.timeline} aria-label="커리어 타임라인">
      {ranged.map(({ record, range }, index) => {
        const year = range.start.slice(0, 4);
        const tick = index === 0 || ranged[index - 1]!.range.start.slice(0, 4) !== year;
        return <Fragment key={record.id}>
          {tick ? <li className={styles.timelineYear} aria-hidden="true"><span>{year}</span></li> : null}
          <li>
            <time dateTime={range.start}><strong>{formatDate(range.start)}</strong>{range.end ? <span>{formatDate(range.end)}</span> : null}</time>
            {card(record)}
          </li>
        </Fragment>;
      })}
      <li className={styles.timelineAdd}><span /><button type="button" onClick={() => void props.onCreate()}><Icon name="plus" size={13} />새 기록</button></li>
    </ol>
    {undated.length ? <section className={styles.timelineUndated} aria-label="날짜 없는 기록">
      <h3>날짜 없음<small>{undated.length}</small></h3>
      <ul>{undated.map((record) => <li key={record.id}>{card(record)}</li>)}</ul>
    </section> : null}
  </div>;
}
