import type { BrewState } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import { openPortfolioAction, refreshGenerationAction } from "./design-actions";
import styles from "./page.module.css";

/** 추출이 지나는 자리. `generation_job.stage`가 그대로 문장이 된다. */
const STAGE = {
  queued: "차례를 기다리는 중",
  validating: "근거와 맞춰 보는 중",
  materializing: "문장과 지면을 앉히는 중",
  charging: "마무리하는 중",
  done: "다 됐습니다",
  failed: "실패",
} as const;

/**
 * 추출 중 · 추출 끝.
 *
 * 01b·02b의 `Waiting`과 같은 자리지만 잡 표가 다르다(`generation_job`). 끝나면
 * 스스로 넘어가지 않고 **눌러서** 간다 — 3분을 기다린 사람이 다른 탭에 있는
 * 동안 화면이 멋대로 바뀌면 무엇이 만들어졌는지 못 본다.
 */
export function Generating({
  brewId,
  generation,
  portfolioId,
}: {
  brewId: string;
  generation: NonNullable<BrewState["latestGeneration"]>;
  portfolioId: string | null;
}) {
  const running = generation.status === "queued" || generation.status === "running";

  return (
    <div className={styles.gate}>
      <div className={styles.gateCard}>
        <span className={`${styles.gateBadge} ${running ? "ex-anim-bob" : ""}`}>
          <Icon name="coffee" weight="fill" size={18} color="var(--ex-bean-50)" />
        </span>
        <h1 className={styles.gateTitle}>{running ? "추출하는 중" : "다 뽑혔습니다"}</h1>
        <p className={styles.gateNote}>
          {running
            ? "3분쯤 걸립니다. 이 화면을 닫아도 계속됩니다 — 문장과 지면 세 안이 함께 나옵니다."
            : "문장과 지면이 준비됐습니다. 04에서 고치고 08b에서 내보냅니다."}
        </p>

        {running ? (
          <div className={styles.gateStage}>
            <span className={styles.gateDot} />
            <span>{STAGE[generation.stage]}</span>
          </div>
        ) : null}

        {running ? (
          <form action={refreshGenerationAction}>
            <input type="hidden" name="brewId" value={brewId} />
            <button type="submit" className={styles.gateGhost}>새로고침</button>
          </form>
        ) : (
          <>
            {portfolioId ? (
              <form action={openPortfolioAction}>
                <input type="hidden" name="portfolioId" value={portfolioId} />
                <button type="submit" className={styles.gateAction}>포트폴리오 열기</button>
              </form>
            ) : null}
            {/* 다시 뽑는 것은 이번 달 횟수를 한 번 더 쓰는 일이라 따로 세운다. */}
            <Link href={`/brew/${brewId}/design?again=1` as Route} className={styles.gateGhost}>
              디자인을 바꿔 다시 뽑기
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
