"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ensureRecipeAction } from "@/app/(app)/brew/[brewId]/design/design-actions";
import { useRefreshWhile } from "@/app/(app)/brew/[brewId]/use-refresh-while";
import { LogoMark } from "@/components/brand/Logo";
import chatStyles from "@/features/agent-chat/AgentChat.module.css";

import styles from "./DesignChat.module.css";

/**
 * 구성(레시피)이 아직 없는 제작의 디자인 단계. 에이전트의 첫 말은 구성의 섹션과 근거를 읽어 쓰므로 구성이 먼저다.
 *
 * 구성 잡이 돌고 있지 않으면 화면이 뜬 뒤 한 번 맡기고, 끝날 때까지 서버 상태를 다시 읽는다. 구성이 생기면 서버가
 * 이 자리에 대화 화면을 그린다. 맡기는 일을 서버의 렌더에서 하지 않는 것은 렌더가 여러 번 일어나기 때문이다.
 */
export function RecipeWait({ brewId, building, failure }: { brewId: string; building: boolean; failure: string | null }) {
  const [issue, setIssue] = useState<string | null>(failure);
  const asked = useRef(false);
  useEffect(() => {
    if (building || failure || asked.current) return;
    asked.current = true;
    void ensureRecipeAction(brewId).then((result) => setIssue(result.error));
  }, [brewId, building, failure]);
  useRefreshWhile(!issue);

  return (
    <div className={styles.screen}>
      <section className={`${chatStyles.root} ${styles.chat} ${styles.wait}`} aria-label="디자인 대화">
        <div className={chatStyles.identity}>
          <LogoMark size={20} />
          <span>Expresso AI</span>
          {issue ? null : <span className={chatStyles.working}>구성을 만드는 중</span>}
        </div>
        {issue ? (
          <p className={styles.notice} data-tone="error" role="alert">
            {issue}
            <Link className={styles.reply} href={`/brew/${brewId}/design?view=catalog`}>카탈로그 화면으로</Link>
          </p>
        ) : (
          <p className={styles.waitText}>고른 재료로 포트폴리오의 구성을 먼저 잡고 있습니다. 끝나면 여기서 디자인 이야기를 시작합니다.</p>
        )}
      </section>
    </div>
  );
}
