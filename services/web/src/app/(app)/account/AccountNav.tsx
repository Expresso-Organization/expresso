import { Icon } from "@/components/ui/Icon";
import { ACCOUNT } from "@/lib/sample/site";

import styles from "./page.module.css";

const TAB_ICONS = ["user", "receipt", "credit-card", "bell", "database"];

/**
 * 설정 좌측 탭 — 화면과 `loading.tsx`가 함께 쓴다.
 *
 * 다섯 항목은 응답에서 오지 않는다. 기다리는 동안에도 그대로 서 있어야 할
 * 자리다.
 */
export function AccountNav() {
  return (
    <nav className={styles.nav} aria-label="설정">
      {ACCOUNT.tabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          className={`${styles.navItem} ${index === 1 ? styles.navItemActive : ""}`}
        >
          <Icon
            name={TAB_ICONS[index] ?? "gear-six"}
            size={14}
            color={index === 1 ? "var(--ex-ink-900)" : "var(--ex-slate-500)"}
          />
          {tab}
        </button>
      ))}
    </nav>
  );
}
