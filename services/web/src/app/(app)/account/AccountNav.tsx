import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

/** 설정 화면의 묶음. 모두 한 화면에 있고, 왼쪽 목록은 그 자리로 옮겨 준다. */
export const ACCOUNT_SECTIONS = [
  { id: "usage", label: "사용량", icon: "gauge" },
  { id: "notifications", label: "알림", icon: "bell" },
  { id: "surface", label: "지면", icon: "sun" },
  { id: "data", label: "데이터 관리", icon: "database" },
  { id: "ai-chat-settings", label: "AI 채팅", icon: "chat-circle" },
  { id: "ai-consent", label: "AI 사용 동의", icon: "shield-check" },
] as const;

/**
 * 설정 좌측 목록 — 화면과 `loading.tsx`가 함께 쓴다.
 *
 * 항목은 응답에서 오지 않는다. 기다리는 동안에도 그대로 서 있어야 할 자리다.
 */
export function AccountNav() {
  return (
    <nav className={styles.nav} aria-label="설정">
      {ACCOUNT_SECTIONS.map((section) => (
        <a key={section.id} href={`#${section.id}`} className={styles.navItem}>
          <Icon name={section.icon} size={14} color="var(--ex-fg-muted)" />
          {section.label}
        </a>
      ))}
    </nav>
  );
}
