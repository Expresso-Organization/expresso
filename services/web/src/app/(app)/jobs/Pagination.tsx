import type { OffsetPageInfo } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

/**
 * 쪽 번호.
 *
 * 무한 스크롤 대신 번호를 쓴다 — 공고 목록은 훑어 내려가는 피드가 아니라
 * 오가며 고르는 화면이다. 세 쪽 앞의 그 공고로 돌아갈 수 있어야 하고,
 * 주소를 남에게 보낼 수 있어야 한다.
 *
 * 쪽이 많으면 양끝과 지금 근처만 세우고 사이는 줄인다(1 … 7 8 9 … 42).
 * 마흔두 개를 다 세우면 그건 목록이지 이동 수단이 아니다.
 */
const WINDOW = 1;

function windowed(page: number, totalPages: number): (number | "gap")[] {
  const shown = new Set<number>([1, totalPages]);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const value = page + offset;
    if (value >= 1 && value <= totalPages) shown.add(value);
  }
  const sorted = [...shown].sort((left, right) => left - right);

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const value of sorted) {
    // 사이에 딱 한 쪽만 빠졌으면 줄임표 대신 그 쪽을 세운다 — "…"가 한 쪽을
    // 가리키면 누르는 것보다 세는 것이 느리다.
    if (previous && value - previous === 2) out.push(previous + 1);
    else if (previous && value - previous > 2) out.push("gap");
    out.push(value);
    previous = value;
  }
  return out;
}

export function Pagination({
  page,
  href,
}: {
  page: OffsetPageInfo;
  href: (next: number) => Route;
}) {
  // 한 쪽뿐이면 넘길 곳이 없다. 눌리지 않는 컨트롤을 세우지 않는다.
  if (page.totalPages <= 1) return null;

  return (
    <nav className={styles.pager} aria-label="공고 목록 쪽 넘기기">
      {page.hasPrevPage ? (
        <Link href={href(page.page - 1)} className={styles.pagerArrow} aria-label="이전 쪽">
          <Icon name="caret-left" size={13} />
        </Link>
      ) : (
        <span className={`${styles.pagerArrow} ${styles.pagerArrowOff}`} aria-hidden="true">
          <Icon name="caret-left" size={13} />
        </span>
      )}

      {windowed(page.page, page.totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className={styles.pagerGap}>…</span>
        ) : entry === page.page ? (
          <span key={entry} className={`${styles.pagerPage} ${styles.pagerPageOn}`} aria-current="page">
            {entry}
          </span>
        ) : (
          <Link key={entry} href={href(entry)} className={styles.pagerPage}>
            {entry}
          </Link>
        ),
      )}

      {page.hasNextPage ? (
        <Link href={href(page.page + 1)} className={styles.pagerArrow} aria-label="다음 쪽">
          <Icon name="caret-right" size={13} />
        </Link>
      ) : (
        <span className={`${styles.pagerArrow} ${styles.pagerArrowOff}`} aria-hidden="true">
          <Icon name="caret-right" size={13} />
        </span>
      )}
    </nav>
  );
}
