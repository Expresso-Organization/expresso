import type { Route } from "next";
import Link from "next/link";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

/**
 * 볼 것이 없을 때.
 *
 * 방문은 공개 사이트에서만 생긴다. 배포한 적이 없으면 0이 늘어선 대시보드가
 * 아니라 **아직 아무도 볼 수 없다는 사실**을 보여준다 — 0은 "아무도 안 왔다"는
 * 뜻이고, 그건 지금 사실이 아니다.
 */
export function NothingPublished() {
  return (
    <>
      <AppHeader title="분석" />
      <AppBody>
        <div className={styles.blank}>
          <Icon name="chart-line" size={22} color="var(--ex-slate-400)" />
          <p className={styles.blankTitle}>아직 배포한 포트폴리오가 없습니다</p>
          <p className={styles.blankBody}>
            방문 기록은 공개된 주소에서만 쌓입니다. 배포하면 그때부터 누가 어디를
            읽었는지 여기에 모입니다.
          </p>
          <Link href={"/home" as Route} className={styles.blankAction}>
            포트폴리오로 가기
          </Link>
        </div>
      </AppBody>
    </>
  );
}
