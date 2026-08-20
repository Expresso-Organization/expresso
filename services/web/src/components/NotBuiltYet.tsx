import { AppBody, AppHeader } from "@/components/shell/AppShell";

import styles from "./NotBuiltYet.module.css";

/**
 * §2.1 라우트 맵에는 있지만 아직 만들지 않은 화면. 사이드바가 갈 곳 없는 링크를
 * 걸지 않도록 자리를 잡아 두고, 어느 화면·마일스톤에서 오는지 적어 둔다.
 *
 * 앱 셸과 사이드바는 구간의 `layout.tsx`가 그리므로 여기서는 머리말과 본문만
 * 낸다. 어느 메뉴가 켜질지는 주소가 정한다.
 */
export function NotBuiltYet({
  title,
  screens,
  milestone,
}: {
  title: string;
  screens: string;
  milestone: string;
}) {
  return (
    <>
      <AppHeader title={title} />
      <AppBody>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <span className={styles.screens}>{screens}</span>
            <p className={styles.title}>{title} 화면은 아직 만들지 않았습니다</p>
            <p className={styles.body}>
              화면 정의서에는 이미 그려져 있습니다. {milestone}에서 옮깁니다.
            </p>
          </div>
        </div>
      </AppBody>
    </>
  );
}
