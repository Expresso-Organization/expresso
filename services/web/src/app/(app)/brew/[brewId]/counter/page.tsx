import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { brews, interview } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Waiting } from "../Waiting";
import {
  answerQuestionAction,
  replaceQuestionAction,
  startInterviewAction,
} from "../brew-actions";
import styles from "./page.module.css";

/**
 * 01b 대화.
 *
 * 질문은 §8.3 계약이 만든다 — 공고가 요구하는데 기록에 없는 것, 기록에 있는데
 * 수치가 빠진 것. 질문마다 **왜 묻는지**가 붙어 있고, 그 문장을 읽고 답할지
 * 말지 정한다.
 */

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

export default async function CounterPage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const { brewId } = await params;
  const session = await requireSession();

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const drafting = brew.latestJob?.type === "interview" && brew.latestJob.status !== "succeeded";
  if (!brew.interviewSessionId || drafting) {
    return (
      <BrewFrame brewId={brewId} step="counter" portfolioTitle={brew.posting?.title ?? null}
        situation="아직 없음" tinted>
        <Waiting
          title="질문"
          note={`공고와 고른 기록 ${brew.materials.selected}건을 읽고 물어볼 것을 고릅니다.`}
          job={brew.latestJob?.type === "interview" ? brew.latestJob : null}
          action={startInterviewAction}
          actionLabel="질문 만들기"
          rejectedNote="물어볼 자리가 모자랍니다. 공고를 분석하면 요건이 자리가 되고, 수치가 빠진 기록도 자리가 됩니다."
          brewId={brewId}
        />
      </BrewFrame>
    );
  }

  const talk = (await interview.session(session.accessToken, brew.interviewSessionId)).data;
  const answered = talk.questions.filter((question) => question.answered);
  const current = talk.questions.find((question) => !question.answered && !question.skipped);
  const remaining = talk.questions.filter(
    (question) => !question.answered && question.id !== current?.id,
  );
  const last = answered.at(-1);

  return (
    <BrewFrame
      brewId={brewId}
      step="counter"
      portfolioTitle={brew.posting?.title ?? null}
      situation={`남은 질문 ${talk.questionCount - talk.answeredCount}개`}
      tinted
    >
      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.head}>
            <span className={styles.avatar}>
              <Icon name="coffee" weight="fill" size={12} color="var(--ex-accent-surface)" />
            </span>
            <span className={styles.headName}>바리스타</span>
            <span className={styles.headNote}>
              공고를 읽고 질문 {talk.questionCount}개를 골랐습니다
            </span>
            <div className={styles.headRight}>
              <span
                className={styles.progress}
                role="meter"
                aria-valuenow={talk.answeredCount}
                aria-valuemin={0}
                aria-valuemax={talk.questionCount}
                aria-label={`질문 ${talk.questionCount}개 중 ${talk.answeredCount}개 답함`}
              >
                {Array.from({ length: talk.questionCount }, (_, index) => (
                  <span
                    key={index}
                    className={`${styles.progressSlot} ${
                      index < talk.answeredCount ? styles.progressSlotOn : ""
                    }`}
                  />
                ))}
              </span>
              <span className={styles.progressCount}>
                {talk.answeredCount} / {talk.questionCount}
              </span>
            </div>
          </div>

          <div className={styles.thread}>
            {answered.length > 1 ? (
              <div className={styles.collapse}>
                <span className={styles.collapseLine} />
                <span className={styles.collapseLabel}>
                  앞선 질문 {answered.length - 1}개
                </span>
                <span className={styles.collapseLine} />
              </div>
            ) : null}

            {last ? (
              <>
                <div className={styles.aiRow}>
                  <span className={styles.aiAvatar}>
                    <Icon name="coffee" weight="fill" size={12} color="var(--ex-accent-text)" />
                  </span>
                  <div className={styles.aiBubble}>{last.text}</div>
                </div>
                <div className={styles.recordChip}>
                  <Icon name="file-text" size={14} color="var(--ex-fg-muted)" />
                  <span className={styles.recordChipTitle}>답한 내용이 기록으로 남았습니다</span>
                  <Link href="/career/experience" className={styles.recordChipAction}>
                    보기
                  </Link>
                </div>
              </>
            ) : null}

            {current ? (
              <div className={styles.questionRow}>
                <span className={`${styles.questionAvatar} ex-anim-bob`}>
                  <Icon name="coffee" weight="fill" size={12} color="var(--ex-accent-surface)" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.questionNo}>{no(current.order)}</div>
                  <h1 className={styles.questionText}>{current.text}</h1>
                  {current.rationale ? (
                    <div className={styles.questionRationale}>
                      <Icon name="info" size={13} />
                      <span>{current.rationale}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className={styles.questionRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 className={styles.questionText}>다 답하셨습니다.</h1>
                  <div className={styles.questionRationale}>
                    <Icon name="info" size={13} />
                    <span>이제 이 대화와 기록으로 레시피를 짤 수 있습니다.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {current ? (
            <form action={answerQuestionAction} className={styles.composer}>
              <input type="hidden" name="brewId" value={brewId} />
              <input type="hidden" name="sessionId" value={talk.id} />
              <input type="hidden" name="questionId" value={current.id} />
              <div className={styles.inputBox}>
                <textarea
                  name="transcript"
                  className={styles.textarea}
                  placeholder="떠오르는 대로 적어도 됩니다. 문장은 제가 다듬을게요."
                  aria-label="답변"
                  required
                />
                <div className={styles.inputActions}>
                  <span className={styles.inputHint}>
                    적은 그대로 기록에 남습니다 — 없는 수치를 채우지 않습니다
                  </span>
                  <button type="submit" className={styles.send}>
                    보내기
                    <Icon name="arrow-up" size={13} />
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>

        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <div className={styles.sideHeadRow}>
              <span className={styles.sideTitle}>이 질문이 나온 곳</span>
            </div>
            <div className={styles.sideNote}>근거 없는 질문은 만들지 않습니다</div>
          </div>

          <div className={styles.sideBody}>
            {current ? (
              <>
                <div className={styles.recordHead}>
                  <Icon
                    name={current.basis.type === "requirement" ? "target" : "file-text"}
                    size={14}
                    color="var(--ex-fg-muted)"
                  />
                  <span className={styles.recordTitle}>
                    {current.basis.type === "requirement"
                      ? current.basis.coverage === "missing"
                        ? "공고 요건 · 아직 못 채움"
                        : "공고 요건 · 일부만 채움"
                      : "기록 · 수치가 빠짐"}
                  </span>
                </div>
                <div className={styles.recordMeta}>{current.basis.evidence}</div>

                <form action={replaceQuestionAction}>
                  <input type="hidden" name="brewId" value={brewId} />
                  <input type="hidden" name="sessionId" value={talk.id} />
                  <input type="hidden" name="questionId" value={current.id} />
                  <button type="submit" className={styles.listLink}
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
                    이 근거로 다른 질문 받기
                  </button>
                </form>
              </>
            ) : null}

            <div className={styles.divider} />

            <div className={styles.listHead}>
              <span className={styles.listTitle}>답한 질문</span>
              <span className={styles.listCount}>{answered.length}</span>
              <Link href="/career/experience" className={styles.listLink}>
                내 커리어
              </Link>
            </div>
            <div className={styles.finishedList}>
              {answered.map((question) => (
                <div key={question.id} className={styles.finishedRow}>
                  <Icon name="check" size={13} color="var(--ex-fg-muted)" />
                  <span className={styles.finishedTitle}>{question.text}</span>
                </div>
              ))}
            </div>

            <div className={`${styles.divider} ${styles.dividerTight}`} />

            <div className={styles.listHead}>
              <span className={styles.listTitle}>남은 질문</span>
              <span className={styles.listCount}>{remaining.length}</span>
            </div>
            <div className={styles.remainingList}>
              {remaining.map((question) => (
                <div key={question.id} className={styles.remainingRow}>
                  <span className={styles.remainingNo}>{no(question.order)}</span>
                  <span className={styles.remainingText}>{question.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sideFoot}>
            <span className={styles.sideFootText}>
              {talk.answeredCount === 0
                ? "한 개만 답해도\n레시피를 만들 수 있습니다"
                : "언제든 레시피로\n넘어갈 수 있습니다"}
            </span>
            <Link href={`/brew/${brewId}/outline` as Route} className={styles.skip}>
              {talk.answeredCount === talk.questionCount ? "레시피 만들기" : "건너뛰고 진행"}
            </Link>
          </div>
        </aside>
      </div>
    </BrewFrame>
  );
}
