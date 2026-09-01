"use client";

import { partialRecipeSections, type BrewJobStatus, type PartialRecipeSection } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ReadingPanel, type Reading, type ReadingCompany } from "./Brewing";

import styles from "./Waiting.module.css";

export type { Reading, ReadingCompany };

/**
 * 레시피가 짜이는 동안.
 *
 * **여기서 기다리는 시간은 실측 150초다**(sonnet · 재료 10건). 그 앞에서 화면이
 * 진행 막대만 돌리는 것은 말이 안 된다 — 그래서 모델이 쓰는 것을 그대로
 * 흘려보내고, 섹션이 나오는 대로 그린다. 다 되면 이 자리가 그대로 편집 가능한
 * 문서로 바뀐다.
 *
 * 흐르는 것은 끝나지 않은 JSON이고, 그중 그릴 수 있는 데까지를 꺼내는 일은
 * `partialRecipeSections`가 한다 — 백엔드와 웹이 같은 파일을 본다.
 *
 * **프로바이더가 조각을 못 내면 아무것도 안 흐른다.** 그때는 아래 카드가 끝까지
 * 남고 잡의 상태를 물어 넘어간다. 진행률을 지어내지 않는다.
 */
export function Waiting({ job, reading }: { job: BrewJobStatus; reading: Reading }) {
  const router = useRouter();
  const [buffer, setBuffer] = useState("");
  /**
   * 시작한 지 얼마나 됐는가.
   *
   * 남은 시간이 아니다 — 그건 모르고, 모르는 것을 막대로 그리면 거짓말이 된다.
   * 이건 **돌고 있다는 사실**이고, 그건 안다.
   */
  const [elapsed, setElapsed] = useState(0);
  /**
   * 어느 단계인가.
   *
   * `thinking`은 분량만 실려 온다(모델이 내용을 안 준다). 숫자를 보여 주는 대신
   * 단계를 가르는 데 쓴다 — 그게 오는 동안은 구상 중이고, 조각이 오기 시작하면
   * 쓰는 중이다.
   */
  const [stage, setStage] = useState<"waiting" | "thinking" | "writing">("waiting");

  useEffect(() => {
    const source = new EventSource(`/api/brew-jobs/${job.jobId}/recipe-stream`);

    const restart = () => {
      // 끊겼다 다시 붙으면 서버가 처음부터 다시 보낸다. 받는 쪽도 처음으로.
      setBuffer("");
      setStage("waiting");
    };
    source.addEventListener("open", restart);
    // 큐가 다시 부르면 같은 열쇠에 두 번째 판이 쌓인다. 앞 판을 이어 붙이면 깨진다.
    source.addEventListener("begin", restart);
    source.addEventListener("thinking", () => setStage((now) => (now === "writing" ? now : "thinking")));
    source.addEventListener("delta", (event) => {
      const { text } = JSON.parse((event as MessageEvent<string>).data) as { text: string };
      setBuffer((current) => current + text);
      setStage("writing");
    });
    for (const name of ["done", "failed"]) {
      source.addEventListener(name, () => {
        source.close();
        // 이제 진짜가 있다. 서버가 다시 그리면 이 화면은 사라진다.
        router.refresh();
      });
    }

    return () => source.close();
  }, [job.jobId, router]);

  /*
   * 흐르지 않을 때를 위한 길.
   *
   * 조각이 오기 시작하면 끝은 `done`이 알려 준다. 그전까지는 — 그리고 조각을
   * 못 내는 프로바이더에서는 — 잡의 상태를 묻는 것이 유일한 신호다.
   */
  useEffect(() => {
    const every = stage === "writing" ? 20_000 : 2_000;
    const timer = window.setInterval(() => router.refresh(), every);
    return () => window.clearInterval(timer);
  }, [router, stage]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((now) => now + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const sections = partialRecipeSections(buffer);

  const writing = sections.length > 0;

  return (
    <div className={styles.live}>
      <div className={styles.bar}>
        <span className={styles.dot} aria-hidden="true" />
        <span aria-live="polite">
          {job.status === "queued"
            ? "차례를 기다리는 중"
            : writing ? "레시피를 짜는 중" : stage === "thinking" ? "구상하는 중" : "재료를 읽는 중"}
        </span>
        <span className={styles.barCount}>
          {writing ? `섹션 ${sections.length} · ` : ""}{clock(elapsed)}
        </span>
      </div>
      <div className={styles.sheet}>
        {writing ? (
          <div className={styles.doc} aria-live="polite" aria-busy="true">
            {sections.map((section, index) => (
              <Section
                key={index}
                section={section}
                order={index}
                // 커서는 맨 마지막 자리에만 선다 — 지금 써지는 곳이 거기다.
                writing={index === sections.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className={styles.readingDoc}>
            <ReadingPanel queued={job.status === "queued"} reading={reading} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 흐른 시간. 분이 넘어가기 전에는 초만 쓴다. */
function clock(seconds: number): string {
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

/** 아직 짜이는 중인 섹션 하나. 안 온 것은 자리만 잡는다. */
function Section({
  section,
  order,
  writing,
}: {
  section: PartialRecipeSection;
  order: number;
  writing: boolean;
}) {
  // 지금 글자가 붙고 있는 자리. 스키마에 적힌 순서대로 오기 때문에 알 수 있다.
  const at = writing
    ? section.items.length > 0 ? "item" : section.takeaway ? "takeaway" : section.purpose ? "purpose" : "title"
    : null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionNo}>{String(order + 1).padStart(2, "0")}</span>
        <h2 className={styles.sectionTitle}>
          {section.title || <span className={styles.pending} aria-hidden="true" />}
          {at === "title" ? <Caret /> : null}
        </h2>
      </div>
      {section.purpose ? (
        <p className={styles.sectionPurpose}>
          {section.purpose}
          {at === "purpose" ? <Caret /> : null}
        </p>
      ) : null}
      {section.takeaway ? (
        <p className={styles.takeawayRow}>
          {/* 기획서 §7.8 의 이름 그대로. 풀어 쓰지 않는다. */}
          <span>핵심 메시지</span>
          <span className={styles.takeaway}>
            {section.takeaway}
            {at === "takeaway" ? <Caret /> : null}
          </span>
        </p>
      ) : null}
      {section.items.length > 0 ? (
        <ul className={styles.items}>
          {section.items.map((text, index) => (
            <li key={index} className={styles.item}>
              <span className={styles.itemMark} aria-hidden="true" />
              <span className={styles.itemText}>
                {text}
                {at === "item" && index === section.items.length - 1 ? <Caret /> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Caret() {
  return <span className={styles.caret} aria-hidden="true" />;
}

