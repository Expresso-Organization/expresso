import type { BrewState } from "@expresso/contracts";

import { refreshGenerationAction } from "./design-actions";
import { GenerationWait, type WaitReading } from "./GenerationWait";
import { LivePreview } from "./LivePreview";
import styles from "./page.module.css";

/**
 * 추출 중.
 *
 * 설계 출력이 오기 전까지는 `GenerationWait`이 선다 — 위에는 브루잉, 10초 뒤부터 그 아래에 모델이 읽고
 * 있는 입력 묶음. 설계가 오면 `LivePreview`가 그 자리에 **만들어지는 지면을 그대로 세운다.**
 *
 * 끝나면 이 화면을 거치지 않는다. 03 화면이 끝난 생성을 06 다듬기로 넘긴다(`page.tsx`).
 *
 * 새로고침 버튼은 남겨 둔다. 끝났다는 신호는 워커가 보내는데, 그 워커가 죽으면 아무 신호도
 * 안 온다. 그때 사람이 누를 버튼이 있어야 한다.
 */
export function Generating({
  brewId,
  generation,
  title,
  reading,
  brewingLeftMs,
}: {
  brewId: string;
  generation: NonNullable<BrewState["latestGeneration"]>;
  title: string;
  reading: WaitReading;
  brewingLeftMs: number;
}) {
  return (
    <LivePreview jobId={generation.id} title={title}>
      <GenerationWait
        reading={reading}
        brewingLeftMs={brewingLeftMs}
        actions={
          <form action={refreshGenerationAction}>
            <input type="hidden" name="brewId" value={brewId} />
            <button type="submit" className={styles.gateGhost}>새로고침</button>
          </form>
        }
      />
    </LivePreview>
  );
}
