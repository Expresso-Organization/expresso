"use client";

import type { Activity } from "@expresso/contracts";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Masonry } from "@/components/ui/Masonry";
import { API_BASE_URL } from "@/lib/api/client";

import { activityInitial, activityLine } from "./explore";
import styles from "./explore.module.css";
import jobStyles from "./page.module.css";

/*
 * 카드 높이 추정(배치용). 포스터 카드는 그림 높이 + 아래 글(제목 두 줄 · 한 줄 정보 · 태그),
 * 포스터 없는 카드는 이니셜 줄 높이다. 실제 높이와 몇 px 어긋나도 열 고르기만 조금 달라진다.
 */
const POSTER_BODY = 118;
const PLAIN_CARD = 96;

/** 06 탐색의 공모전 · 해커톤 · 부트캠프 — 포스터 카드의 워터폴 그리드. */
export function ActivityWall({ rows }: { rows: Activity[] }) {
  return (
    <Masonry
      items={rows}
      keyOf={(row) => row.id}
      estimate={(row, columnWidth) => (row.poster ? (columnWidth * row.poster.height) / row.poster.width + POSTER_BODY : PLAIN_CARD)}
      render={(row) => <ActivityCard row={row} />}
      minColumn={236}
      minColumnNarrow={150}
      gap={16}
      className={styles.wall}
    />
  );
}

function ActivityCard({ row }: { row: Activity }) {
  const line = activityLine(row);
  if (!row.poster) {
    return (
      <a href={row.url} target="_blank" rel="noreferrer" className={`${styles.card} ${styles.cardPlain}`}>
        <CompanyAvatar company={{ name: row.host || row.title, initial: activityInitial(row.host || row.title) }} className={jobStyles.avatar} />
        <span className={styles.cardPlainBody}>
          <span className={styles.cardTitle}>{row.title}</span>
          <span className={styles.cardMeta}>{line.meta}</span>
          <span className={`${styles.cardDeadline} ${line.urgent ? styles.cardDeadlineUrgent : ""}`}>{line.deadline}</span>
        </span>
      </a>
    );
  }
  return (
    <a href={row.url} target="_blank" rel="noreferrer" className={styles.card}>
      <span className={styles.cardMedia}>
        {/* 가로세로를 주어 그림이 오기 전에도 카드 높이가 잡힌다. 제목이 바로 아래에 있어 대체 글은 비운다. */}
        <img src={new URL(row.poster.url, API_BASE_URL).href} alt="" width={row.poster.width} height={row.poster.height} loading="lazy" decoding="async" className={styles.cardPoster} />
        <span className={`${styles.cardChip} ${line.urgent ? styles.cardChipUrgent : ""}`}>{line.deadline}</span>
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{row.title}</span>
        <span className={styles.cardMeta}>{line.meta}</span>
        {row.fields.length ? (
          <span className={styles.cardTags}>
            {row.fields.slice(0, 2).map((field) => <span key={field} className={styles.cardTag}>{field}</span>)}
          </span>
        ) : null}
      </span>
    </a>
  );
}
