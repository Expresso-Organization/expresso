import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import { EXPLORE_KINDS, exploreHref, type ExploreKind } from "./explore";
import styles from "./explore.module.css";

/** 탐색의 종류 목록과 그 옆의 내용 자리. 라이브러리와 같이 왼쪽에서 고르고 오른쪽에서 본다. */
export function ExploreFrame({ kind, children }: { kind: ExploreKind; children: ReactNode }) {
  return (
    <div className={styles.split}>
      <nav className={styles.list} aria-label="탐색 종류">
        {EXPLORE_KINDS.map((item) => (
          <Link
            key={item.key}
            href={exploreHref(item.key) as unknown as Route}
            className={styles.listRow}
            aria-current={item.key === kind ? "page" : undefined}
          >
            <Icon name={item.icon} weight={item.key === kind ? "fill" : "regular"} size={15} />
            <span className={styles.listName}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={styles.pane}>{children}</div>
    </div>
  );
}
