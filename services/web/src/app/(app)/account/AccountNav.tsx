import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ACCOUNT } from "@/lib/sample/site";

import styles from "./page.module.css";

const TAB_ICONS = ["user", "receipt", "credit-card", "bell", "database"];

/** 화면이 있는 탭만 주소를 가진다. 나머지 셋은 아직 갈 곳이 없다. */
const TAB_HREFS: Record<number, string> = { 0: "/account/profile", 1: "/account" };

const ACTIVE_INDEX = { profile: 0, plan: 1 } as const;

/**
 * 설정 좌측 탭 — 화면과 `loading.tsx`가 함께 쓴다.
 *
 * 다섯 항목은 응답에서 오지 않는다. 기다리는 동안에도 그대로 서 있어야 할
 * 자리다. 그래서 지금 보고 있는 탭도 주소가 아니라 `active`로 받는다 —
 * `loading.tsx`는 서버 컴포넌트이고 `usePathname`을 쓸 수 없다.
 */
export function AccountNav({ active }: { active: keyof typeof ACTIVE_INDEX }) {
  const activeIndex = ACTIVE_INDEX[active];

  return (
    <nav className={styles.nav} aria-label="설정">
      {ACCOUNT.tabs.map((tab, index) => {
        const current = index === activeIndex;
        const className = `${styles.navItem} ${current ? styles.navItemActive : ""}`;
        const icon = (
          <Icon
            name={TAB_ICONS[index] ?? "gear-six"}
            size={14}
            color={current ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
          />
        );
        const href = TAB_HREFS[index];

        return href ? (
          <Link
            key={tab}
            href={href}
            className={className}
            aria-current={current ? "page" : undefined}
          >
            {icon}
            {tab}
          </Link>
        ) : (
          <button key={tab} type="button" className={className}>
            {icon}
            {tab}
          </button>
        );
      })}
    </nav>
  );
}
