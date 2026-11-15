"use client";

import type { Proposal, ProposalFeed as Feed, ProposalRef, ProposalRunReason } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { ToolStep } from "@/features/agent-chat/ToolStep";

import { ProposalAction } from "./HomeStart";
import type { BriefingFinding } from "./briefing";
import styles from "./home-start.module.css";
import { disableProposalsAction, dismissProposalAction, enableProposalsAction, loadProposalsAction, refreshProposalsAction, type ProposalActionResult } from "./proposal-actions";

/** 실행 중에 상태를 다시 읽는 간격. */
const POLL_MS = 2_000;

const SUBJECT_KIND: Record<ProposalRef["kind"], { label: string; icon: string }> = {
  job: { label: "채용 공고", icon: "briefcase" },
  activity: { label: "공모전", icon: "trophy" },
  record: { label: "내 기록", icon: "notebook" },
};

const REASON: Record<ProposalRunReason, string> = {
  no_credits: "이번 달 크레딧을 모두 써서 새 제안을 만들지 않았습니다.",
  consent_required: "커리어 기록의 AI 사용 동의가 꺼져 있어 제안을 만들지 않았습니다.",
  ai_unavailable: "지금은 제안을 만들 수 없습니다.",
  nothing_new: "새로 권할 것이 없습니다. 새 공고나 공모전이 들어오면 다시 확인합니다.",
  failed: "제안을 만들다 멈췄습니다. 다시 받아 보세요.",
};

function deadline(daysLeft: number | null): string | null {
  if (daysLeft === null || daysLeft < 0) return null;
  return daysLeft === 0 ? "오늘 마감" : `마감 ${daysLeft}일 전`;
}

function time(at: string): string {
  return new Date(at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 홈의 제안 공간 — 에이전트가 내 기록과 새 공고 · 공모전을 읽고 먼저 권하는 행동.
 *
 * 켜지 않았으면 켜는 자리만 선다. 켜면 서버가 하루 한 번, 그리고 새 소식이 들어올 때 제안을 만든다.
 * 만드는 동안에는 서버가 알리는 단계를 대화의 작업 흔적과 같은 모양으로 보인다.
 * `fallback`은 규칙으로 센 제안이다 — 크레딧이 남지 않아 에이전트가 쓰지 못했을 때만 대신 보인다.
 */
export function ProposalFeed({ initial, fallback }: { initial: Feed; fallback: BriefingFinding[] }) {
  const [feed, setFeed] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const working = feed.run.status === "queued" || feed.run.status === "running";

  const apply = (result: ProposalActionResult) => {
    if (result.feed) setFeed(result.feed);
    setError(result.error);
  };
  const run = (action: () => Promise<ProposalActionResult>) => startTransition(async () => apply(await action()));

  // 실행 중에는 끝날 때까지 상태를 다시 읽는다.
  useEffect(() => {
    if (!working) return;
    let alive = true;
    const timer = setInterval(() => { void loadProposalsAction().then((result) => { if (alive && result.feed) setFeed(result.feed); }); }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [working]);

  if (!feed.enabled) {
    return (
      <section className={styles.proposals}>
        <div className={styles.invite}>
          <LogoMark size={28} />
          <div className={styles.inviteBody}>
            <h2 className={styles.inviteTitle}>익스프레소가 먼저 제안하게 하기</h2>
            <p className={styles.inviteText}>내 기록과 새로 올라온 공고 · 공모전을 읽고, 지금 하면 좋은 일을 근거와 함께 권합니다.</p>
          </div>
          <button type="button" className={styles.inviteAction} onClick={() => setAsking(true)}>제안 켜기</button>
        </div>
        {error ? <p role="alert" className={styles.feedError}>{error}</p> : null}
        <Dialog open={asking} onOpenChange={(open) => { if (!pending) setAsking(open); }}>
          <DialogContent className={styles.enableDialog} showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className={styles.enableTitle}>제안을 켜기 전에</DialogTitle>
              <DialogDescription className={styles.enableIntro}>켜면 누르지 않아도 익스프레소가 AI를 실행합니다.</DialogDescription>
            </DialogHeader>
            <dl className={styles.enableFacts}>
              <div><Icon name="notebook" size={18} /><div><dt>읽는 것</dt><dd>내 커리어 기록, 관심 공고, 새로 수집된 채용 공고와 공모전</dd></div></div>
              <div><Icon name="clock" size={18} /><div><dt>실행되는 때</dt><dd>하루에 한 번, 그리고 내 기술과 맞는 새 공고나 공모전이 들어왔을 때 하루 한 번까지</dd></div></div>
              <div><Icon name="coins" size={18} /><div><dt>크레딧</dt><dd>실행할 때마다 사용한 만큼 이번 달 크레딧에서 차감됩니다. 크레딧이 남지 않으면 실행하지 않습니다.</dd></div></div>
              <div><Icon name="sparkle" size={18} /><div><dt>정보를 사용하는 곳</dt><dd>Anthropic의 Claude 모델. 커리어 기록의 AI 사용 동의가 함께 켜집니다.</dd></div></div>
            </dl>
            <DialogFooter className={styles.enableFooter}>
              <button type="button" className={styles.enableCancel} disabled={pending} onClick={() => setAsking(false)}>취소</button>
              <button
                type="button"
                className={styles.enableConfirm}
                disabled={pending}
                onClick={() => startTransition(async () => { const result = await enableProposalsAction(); apply(result); if (result.feed) setAsking(false); })}
              >
                {pending ? "켜는 중" : "켜기"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

  const { run: last } = feed;
  const read = last.read;
  const useFallback = last.reason === "no_credits" && fallback.length > 0;

  return (
    <section className={styles.proposals}>
      <div className={styles.sectionHead}>
        <LogoMark size={16} />
        <h2 className={styles.sectionTitle}>제안</h2>
        {feed.proposals.length > 0 ? <span className={styles.sectionCount}>{feed.proposals.length}</span> : null}
        {!working && last.finishedAt && read ? (
          <span className={styles.checked}>{time(last.finishedAt)} · 기록 {read.records}건 · 공고 {read.jobs}건 · 공모전 {read.activities}건을 읽음</span>
        ) : <span className={styles.checked} />}
        <button type="button" className={styles.feedControl} disabled={working || pending} onClick={() => run(refreshProposalsAction)}>
          <Icon name="arrow-clockwise" size={13} />
          다시 받기
        </button>
        <button type="button" className={styles.feedControl} disabled={pending} onClick={() => run(disableProposalsAction)}>끄기</button>
      </div>

      {working ? (
        <div className={styles.working} role="status">
          <ToolStep
            status={last.stage === "writing" ? "complete" : "running"}
            icon="magnifying-glass"
            title={last.stage === "writing" ? "자료를 골랐습니다" : last.status === "queued" ? "곧 시작합니다" : "자료 고르는 중"}
            summary="내 기록 · 관심 공고 · 새 공고 · 공모전"
          />
          {last.stage === "writing" ? <ToolStep status="running" icon="pencil-simple-line" title="제안 쓰는 중" /> : null}
        </div>
      ) : null}

      {!working && last.reason ? <p className={styles.feedNote}>{REASON[last.reason]}</p> : null}
      {error ? <p role="alert" className={styles.feedError}>{error}</p> : null}

      {feed.proposals.length > 0 ? (
        <div className={styles.proposalGrid}>
          {feed.proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} disabled={pending} onDismiss={() => run(() => dismissProposalAction(proposal.id))} />
          ))}
        </div>
      ) : null}

      {useFallback ? (
        <div className={styles.proposalGrid}>
          {fallback.map((finding) => (
            <article key={finding.id} className={styles.proposal}>
              <p className={styles.proposalTitle}>{finding.text}</p>
              <div className={styles.refs}>
                {finding.items.map((item) => <Link key={item.href} href={item.href as Route} className={styles.ref}>{item.label}</Link>)}
              </div>
              <ProposalAction action={finding.action} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Ref({ item }: { item: ProposalRef }) {
  const body = (
    <>
      <Icon name={SUBJECT_KIND[item.kind].icon} size={12} />
      <span className={styles.refLabel}>{item.label}</span>
      {item.external ? <Icon name="arrow-square-out" size={11} /> : null}
    </>
  );
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" className={styles.ref}>{body}</a>
    : <Link href={item.href as Route} className={styles.ref}>{body}</Link>;
}

function ProposalCard({ proposal, disabled, onDismiss }: { proposal: Proposal; disabled: boolean; onDismiss(): void }) {
  const due = deadline(proposal.subject.daysLeft);
  const urgent = proposal.subject.daysLeft !== null && proposal.subject.daysLeft <= 7;
  const { start } = proposal;
  return (
    <article className={styles.proposal}>
      <div className={styles.proposalMeta}>
        <span>{SUBJECT_KIND[proposal.subject.kind].label}</span>
        {due ? <span className={urgent ? styles.proposalDue : undefined}>{due}</span> : null}
        <button type="button" className={styles.proposalDismiss} disabled={disabled} aria-label="관심 없음" title="관심 없음 — 이 대상을 다시 제안하지 않습니다" onClick={onDismiss}>
          <Icon name="x" size={12} />
        </button>
      </div>
      <h3 className={styles.proposalTitle}>{proposal.title}</h3>
      <p className={styles.proposalReason}>{proposal.reason}</p>
      <div className={styles.refs}>
        <Ref item={proposal.subject} />
        {proposal.records.map((record) => <Ref key={record.id} item={record} />)}
      </div>
      <ProposalAction
        action={start.kind === "chat"
          ? { kind: "chat", label: start.label, prompt: start.prompt, contexts: start.contexts, contextLabels: [proposal.subject, ...proposal.records].map(({ kind, id, label }) => ({ key: `${kind}:${id}`, label })) }
          : { kind: "link", label: start.label, href: start.href }}
      />
    </article>
  );
}
