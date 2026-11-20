"use client";
import type { AgentTable } from "@expresso/contracts";
import styles from "./TablePart.module.css";

/**
 * 비교 표. 찾은 공고나 활동 몇 개를 기준별로 나란히 견준다. 답변 글 아래에 놓인다.
 *
 * 칸의 글은 컨설턴트가 채운 것이다 — 서버의 검색 결과를 그대로 그리는 목록과 다르다. 그래서 표 아래에 그 사실을 적는다.
 * 첫 열은 견주는 대상의 이름이라 줄의 머리로 둔다. 좁은 자리에서는 표가 가로로 넘어가 스크롤된다.
 */
export function TablePart({ table }: { table: AgentTable }) {
  return <figure className={styles.part}>
    <figcaption className={styles.title}>{table.title}</figcaption>
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead><tr>{table.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, at) => at === 0 ? <th key={at} scope="row">{cell}</th> : <td key={at}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className={styles.note}>컨설턴트가 정리한 내용입니다. 지원하기 전에 공고 원문을 확인해 주세요.</p>
  </figure>;
}

/** 표를 정리하는 동안의 자리. 그리지 못했을 때는 아무것도 그리지 않는다(에이전트가 고쳐 다시 그린다). */
export function TablePartPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">표로 정리하고 있습니다.</p>;
}
