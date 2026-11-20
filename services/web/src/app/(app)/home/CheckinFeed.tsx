"use client";

import type { CommitmentCheckinAnswer, ConsultantCheckins, ConsultantCommitment } from "@expresso/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { dayLabel } from "@/features/agent-chat/CommitmentCard";

import { useHomeHandoff } from "./HomeHandoff";
import { FeedCard } from "./ProposalFeed";
import { answerCheckinAction, decideOutreachAction, dismissQuietAction, type CheckinActionResult } from "./checkin-actions";
import styles from "./home-start.module.css";

/** 「아직이에요」에서 먼저 놓는 날짜 — 오늘에서 이만큼 뒤다. */
const POSTPONE_DAYS = 7;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** 대화가 없을 때 건넨 연락에서 「이야기하기」를 누르면 보내는 말. */
const QUIET_PROMPT = "요즘 준비가 어떻게 되어 가는지 이야기하고 싶어요.";

/**
 * 약속 한 건의 확인 — 답은 셋이다.
 * 「했어요」는 그 일을 묻는 대화로 간다. 「아직이에요」는 새 날짜를 받아 미루고, 「안 하기로 했어요」는 닫는다. 뒤의 둘은 AI를 부르지 않는다.
 */
function CommitmentCheck({ commitment, today, disabled, onAnswer }: { commitment: ConsultantCommitment; today: string; disabled: boolean; onAnswer(answer: CommitmentCheckinAnswer): void }) {
  const [postponing, setPostponing] = useState(false);
  const [day, setDay] = useState(addDays(today, POSTPONE_DAYS));
  return (
    <FeedCard icon="calendar-check" hue="terracotta" title="하기로 한 일">
      <p className={styles.proposalMessage}>「{commitment.title}」 어떻게 됐나요?</p>
      <p className={styles.checkinDue}>{dayLabel(commitment.dueOn)}까지 하기로 한 일입니다.</p>
      {postponing ? (
        <form className={`${styles.proposalActions} ${styles.checkinActions}`} onSubmit={(event) => { event.preventDefault(); if (day) onAnswer({ answer: "not_yet", dueOn: day }); }}>
          <label className={styles.checkinDateLabel}>
            언제까지 해 볼까요?
            <input type="date" className={styles.checkinDate} value={day} min={today} disabled={disabled} onChange={(event) => setDay(event.target.value)} />
          </label>
          <button type="submit" className={styles.proposalAction} disabled={disabled || !day}>이 날짜로</button>
          <button type="button" className={styles.proposalPass} disabled={disabled} onClick={() => setPostponing(false)}>취소</button>
        </form>
      ) : (
        <div className={`${styles.proposalActions} ${styles.checkinActions}`}>
          <button type="button" className={styles.proposalAction} disabled={disabled} onClick={() => onAnswer({ answer: "done" })}>했어요</button>
          <button type="button" className={styles.proposalPass} disabled={disabled} onClick={() => setPostponing(true)}>아직이에요</button>
          <button type="button" className={styles.proposalPass} disabled={disabled} onClick={() => onAnswer({ answer: "dropped" })}>안 하기로 했어요</button>
        </div>
      )}
    </FeedCard>
  );
}

/**
 * 홈의 확인 구획 — 컨설턴트가 먼저 건네는 연락.
 *
 * 약속한 날이 된 일을 묻고, 대화가 2주 없으면 한 번 안부를 묻는다. 건넬 것이 없으면 구획을 그리지 않는다.
 * 능동 제안은 켰는데 약속 확인을 아직 정하지 않은 사용자에게는 받을지 묻는 카드를 세운다.
 */
export function CheckinFeed({ initial, proposalsEnabled }: { initial: ConsultantCheckins; proposalsEnabled: boolean }) {
  const router = useRouter();
  const handoff = useHomeHandoff();
  const [checkins, setCheckins] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (result: CheckinActionResult) => {
    if (result.checkins) setCheckins(result.checkins);
    setError(result.error);
  };
  const answer = (commitment: ConsultantCommitment, value: CommitmentCheckinAnswer) => startTransition(async () => {
    setNote(null);
    const result = await answerCheckinAction(commitment.id, value);
    apply(result);
    if (result.error) return;
    if (value.answer === "done") {
      if (result.conversationId) router.push(`/home?chat=${result.conversationId}` as Route);
      else setNote("마친 일로 남겼습니다. 지금은 대화를 열 수 없어 이야기는 다음에 여쭙니다.");
    } else if (value.answer === "not_yet") setNote(`${dayLabel(value.dueOn)}에 다시 여쭙니다.`);
    else setNote("하지 않기로 한 일로 남겼습니다.");
  });

  // 요금제가 열지 않으면 서버가 확인할 것을 비워 보낸다. 받을지 묻는 카드도 세우지 않는다.
  const asking = checkins.available && proposalsEnabled && checkins.outreach === null;
  if (!asking && checkins.commitments.length === 0 && !checkins.quiet && !note && !error) return null;

  return (
    <section className={styles.proposals} aria-label="확인">
      <div className={styles.sectionHead}>
        <LogoMark size={16} />
        <h2 className={styles.sectionTitle}>확인</h2>
        {checkins.commitments.length > 0 ? <span className={styles.sectionCount}>{checkins.commitments.length}</span> : null}
      </div>
      {note ? <p className={styles.feedNote} role="status">{note}</p> : null}
      {error ? <p role="alert" className={styles.feedError}>{error}</p> : null}
      <div className={styles.proposalGrid}>
        {checkins.commitments.map((commitment) => (
          <CommitmentCheck key={commitment.id} commitment={commitment} today={checkins.today} disabled={pending} onAnswer={(value) => answer(commitment, value)} />
        ))}
        {checkins.quiet ? (
          <FeedCard icon="chat-circle-dots" hue="terracotta" title="요즘 어떠세요">
            <p className={styles.proposalMessage}>2주 동안 대화가 없었습니다. 요즘 준비가 어떻게 되어 가는지 들려주시면 이어서 돕겠습니다.</p>
            <div className={styles.proposalActions}>
              <button
                type="button"
                className={styles.proposalAction}
                disabled={pending || handoff.pending}
                onClick={() => { void dismissQuietAction(); handoff.open({ text: QUIET_PROMPT, contexts: [] }); }}
              >
                이야기하기
              </button>
              <button type="button" className={styles.proposalPass} disabled={pending} onClick={() => startTransition(async () => apply(await dismissQuietAction()))}>닫기</button>
            </div>
          </FeedCard>
        ) : null}
        {asking ? (
          <FeedCard icon="bell" hue="terracotta" title="하기로 한 일 챙기기">
            <p className={styles.proposalMessage}>대화에서 하기로 한 일을 약속한 날에 여쭤봐도 될까요? 답이 없으면 3일 뒤에 한 번만 더 여쭙니다.</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.proposalAction} disabled={pending} onClick={() => startTransition(async () => apply(await decideOutreachAction(true)))}>좋아요</button>
              <button type="button" className={styles.proposalPass} disabled={pending} onClick={() => startTransition(async () => apply(await decideOutreachAction(false)))}>괜찮아요</button>
            </div>
          </FeedCard>
        ) : null}
      </div>
    </section>
  );
}
