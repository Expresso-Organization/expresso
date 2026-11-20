import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { ApiError } from "@/lib/api/client";
import { career, consultant } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { GoalEditor } from "./GoalEditor";
import { ProgressSections } from "./ProgressSections";
import styles from "./goal.module.css";

const SEOUL_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/**
 * 내 진행.
 *
 * 컨설턴트가 이어 가는 것을 사용자가 보고 고친다. 맨 위는 구직 목표다 — 컨설턴트가 권할 때 기준으로 삼는 것을
 * 사용자가 직접 적는다(질문은 온보딩의 목표 화면과 같다). 그 아래에 컨설턴트가 기억하는 단계 · 조건 · 최근 대화가 놓인다.
 * 에이전트 채팅이 꺼진 서버에는 기억이 없다(404). 그때는 구직 목표만 보인다.
 */
export default async function GoalPage() {
  const session = await requireSession();
  const [{ data: goal }, memory] = await Promise.all([
    career.goal(session.accessToken),
    consultant.memory(session.accessToken).then(result => result.data).catch(error => { if (error instanceof ApiError && error.status === 404) return null; throw error; }),
  ]);
  return (
    <>
      <AppHeader title="내 진행" />
      <AppBody>
        <div className={styles.stage}>
          <div className={styles.column}>
            <h1 className={styles.title}>어떤 자리를 목표로 하고 계신가요?</h1>
            <p className={styles.lede}>익스프레소가 공고와 활동을 권하고 기록과 포트폴리오를 살필 때 이 목표를 기준으로 삼습니다. 언제든 고칠 수 있습니다.</p>
            <GoalEditor goal={goal} />
            {memory ? <ProgressSections memory={memory} conversations={memory.recentConversations.map(item => ({ id: item.conversationId, title: item.title, date: SEOUL_DATE.format(new Date(item.updatedAt)), outcomes: item.outcomes.slice(-3) }))} /> : null}
          </div>
        </div>
      </AppBody>
    </>
  );
}
