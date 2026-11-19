import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { career } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { GoalEditor } from "./GoalEditor";
import styles from "./goal.module.css";

/**
 * 구직 목표.
 *
 * 에이전트가 권할 때 기준으로 삼는 것을 사용자가 직접 적는다. 온보딩을 이미 지난 사람과
 * 목표가 바뀐 사람이 여기서 적고 고친다. 질문은 온보딩의 목표 화면과 같다.
 */
export default async function GoalPage() {
  const session = await requireSession();
  const { data: goal } = await career.goal(session.accessToken);
  return (
    <>
      <AppHeader title="구직 목표" />
      <AppBody>
        <div className={styles.stage}>
          <div className={styles.column}>
            <h1 className={styles.title}>어떤 자리를 목표로 하고 계신가요?</h1>
            <p className={styles.lede}>익스프레소가 공고와 활동을 권하고 기록과 포트폴리오를 살필 때 이 목표를 기준으로 삼습니다. 언제든 고칠 수 있습니다.</p>
            <GoalEditor goal={goal} />
          </div>
        </div>
      </AppBody>
    </>
  );
}
