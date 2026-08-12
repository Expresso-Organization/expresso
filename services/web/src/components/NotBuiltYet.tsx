import { AppHeader, AppShell } from "@/components/shell/AppShell";
import { Sidebar, type SidebarSection } from "@/components/shell/Sidebar";
import { requireSession } from "@/lib/require-session";

import styles from "./NotBuiltYet.module.css";

/**
 * §2.1 라우트 맵에는 있지만 아직 만들지 않은 화면. 사이드바가 갈 곳 없는 링크를
 * 걸지 않도록 자리를 잡아 두고, 어느 화면·마일스톤에서 오는지 적어 둔다.
 */
export async function NotBuiltYet({
  section,
  title,
  screens,
  milestone,
}: {
  section: SidebarSection;
  title: string;
  screens: string;
  milestone: string;
}) {
  const session = await requireSession();

  return (
    <AppShell
      sidebar={
        <Sidebar
          active={section}
          categories={session.categories}
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={<AppHeader title={title} />}
    >
      <div className={styles.wrap}>
        <div className={styles.card}>
          <span className={styles.screens}>{screens}</span>
          <p className={styles.title}>{title} 화면은 아직 만들지 않았습니다</p>
          <p className={styles.body}>
            화면 정의서에는 이미 그려져 있습니다. {milestone}에서 옮깁니다.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
