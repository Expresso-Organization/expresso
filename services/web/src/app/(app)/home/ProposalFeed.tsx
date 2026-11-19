"use client";

import type { Proposal, ProposalAction as Action, ProposalFeed as Feed, ProposalRef, ProposalRunReason } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { tintOf, type TintHue } from "@/components/ui/company-avatar-tint";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { putAgentHandoff } from "@/features/agent-chat/agent-handoff";
import { ToolStep } from "@/features/agent-chat/ToolStep";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";

import { ProposalAction } from "./HomeStart";
import type { BriefingFinding } from "./briefing";
import styles from "./home-start.module.css";
import { disableProposalsAction, dismissProposalAction, enableProposalsAction, loadProposalsAction, refreshProposalsAction, type ProposalActionResult } from "./proposal-actions";

/** 실행 중에 상태를 다시 읽는 간격. */
const POLL_MS = 2_000;
/** 마감 임박의 기준. 위젯과 같은 7일이다. */
const URGENT_DAYS = 7;

/** 제안의 종류 — 카드의 제목 · 아이콘 · 색은 에이전트가 고른 행동이 정한다. */
const KIND: Record<Action, { title: string; icon: string; hue: TintHue }> = {
  start_portfolio: { title: "포트폴리오 만들기", icon: "briefcase", hue: "steel" },
  compare_job: { title: "공고 요건 대조", icon: "list-checks", hue: "indigo" },
  plan_activity: { title: "공모전 참가", icon: "trophy", hue: "olive" },
  strengthen_record: { title: "기록 채우기", icon: "notebook", hue: "amber" },
};

const REASON: Record<ProposalRunReason, string> = {
  no_credits: "이번 달 크레딧을 모두 써서 새 제안을 만들지 않았습니다.",
  consent_required: "커리어 기록의 AI 사용 동의가 꺼져 있어 제안을 만들지 않았습니다.",
  ai_unavailable: "지금은 제안을 만들 수 없습니다.",
  nothing_new: "새로 권할 것이 없습니다. 새 공고나 공모전이 들어오면 다시 확인합니다.",
  failed: "제안을 만들다 멈췄습니다. 다시 받아 보세요.",
};

/**
 * 제안 구획의 카드 한 장 — 위젯 카드와 같은 틀이다. 머리줄의 아이콘 자리에 종류 표시가 서고, 카드에서 색이 있는 곳은 거기뿐이다.
 * 색은 회사 아바타의 틴트 규칙에서 색상만 골라 쓴다.
 */
function FeedCard({ icon, hue, title, children }: { icon: string; hue: TintHue; title: string; children: ReactNode }) {
  return (
    <article className={`${styles.widget} ${styles.proposalCard}`}>
      <header className={styles.widgetHead}>
        <span className={styles.proposalMark} style={tintOf(hue)}><Icon name={icon} size={14} /></span>
        <h3 className={styles.widgetTitle}>{title}</h3>
      </header>
      {children}
    </article>
  );
}

/**
 * 메시지가 인용한 대상 한 줄 — 위젯의 줄과 같은 모양이다.
 * 공고는 회사 로고(없으면 이니셜), 기록은 그 기록이 든 서랍의 아이콘, 활동은 위젯의 아이콘으로 선다. 누르면 그 대상이 열린다.
 */
function RefRow({ item }: { item: ProposalRef }) {
  const body = (
    <>
      {item.kind === "job"
        ? <CompanyAvatar company={item.company ?? { name: item.sub ?? item.label }} className={styles.avatar} />
        : (
          <span className={`${styles.avatar} ${styles.refIcon}`}>
            <Icon name={item.kind === "activity" ? "trophy" : (item.categoryKey && CAREER_CATEGORY_ICONS[item.categoryKey]) || "notebook"} size={15} />
          </span>
        )}
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.label}</span>
        {item.sub ? <span className={styles.rowSub}>{item.sub}</span> : null}
      </span>
      {item.daysLeft !== null && item.daysLeft >= 0 ? (
        <span className={`${styles.rowDeadline} ${item.daysLeft <= URGENT_DAYS ? styles.rowDeadlineUrgent : ""}`}>D-{item.daysLeft}</span>
      ) : null}
      {item.external ? <Icon name="arrow-square-out" size={12} className={styles.refOut} /> : null}
    </>
  );
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" className={styles.row}>{body}</a>
    : <Link href={item.href as Route} className={styles.row}>{body}</Link>;
}

/**
 * 제안 한 건 — 제목, 에이전트의 제안 메시지, 인용한 대상, 사용자의 선택.
 * 대화를 여는 버튼은 입력창을 거치지 않고 그 말로 대화를 바로 시작한다(홈의 입력창이 말을 넘기는 길과 같다).
 */
function ProposalCard({ proposal, disabled, onDismiss }: { proposal: Proposal; disabled: boolean; onDismiss(): void }) {
  const router = useRouter();
  const { start, subject } = proposal;
  const kind = KIND[proposal.action];
  const title = proposal.action === "plan_activity" && subject.activityKind === "hackathon" ? "해커톤 참가" : kind.title;
  return (
    <FeedCard icon={kind.icon} hue={kind.hue} title={title}>
      <p className={styles.proposalMessage}>{proposal.message}</p>
      <ul className={`${styles.rows} ${styles.proposalRefs}`}>
        {[subject, ...proposal.records].map((item) => <li key={`${item.kind}:${item.id}`}><RefRow item={item} /></li>)}
      </ul>
      <div className={styles.proposalActions}>
        {start.kind === "chat" ? (
          <button
            type="button"
            className={styles.proposalAction}
            onClick={() => { putAgentHandoff({ text: start.prompt, contexts: start.contexts }); router.push("/home?compose=1"); }}
          >
            {start.label}
          </button>
        ) : (
          <Link href={start.href as Route} className={styles.proposalAction}>
            {start.label}
            <Icon name="arrow-right" size={12} />
          </Link>
        )}
        <button type="button" className={styles.proposalPass} disabled={disabled} title="이 대상을 다시 제안하지 않습니다" onClick={onDismiss}>관심 없음</button>
      </div>
    </FeedCard>
  );
}

/**
 * 구직 목표를 아직 모를 때 에이전트가 먼저 묻는 카드. 제안을 켰는지와 상관없이 맨 앞에 선다 —
 * 목표는 에이전트가 권할 때 기준으로 삼는 것이라 다른 제안보다 먼저다. 누르면 구직 목표 화면으로 간다.
 */
function GoalCard() {
  return (
    <FeedCard icon="target" hue="terracotta" title="구직 목표">
      <p className={styles.proposalMessage}>아직 어떤 일을 목표로 하시는지 모릅니다. 알려 주시면 그 목표에 맞춰 공고와 활동을 권합니다.</p>
      <div className={styles.proposalActions}>
        <Link href={"/goal" as Route} className={styles.proposalAction}>목표 알려 주기</Link>
      </div>
    </FeedCard>
  );
}

/**
 * 홈의 제안 구획 — 에이전트가 내 기록과 새 공고 · 공모전을 읽고 먼저 권하는 행동.
 *
 * 켜지 않았으면 켜는 카드만 선다. 켜면 서버가 하루 한 번, 그리고 새 소식이 들어올 때 제안을 만든다.
 * 만드는 동안에는 서버가 알리는 단계를 대화의 작업 흔적과 같은 모양으로 보인다.
 * `fallback`은 규칙으로 센 제안이다 — 크레딧이 남지 않아 에이전트가 쓰지 못했을 때만 대신 보인다.
 */
export function ProposalFeed({ initial, fallback, hasGoal }: { initial: Feed; fallback: BriefingFinding[]; hasGoal: boolean }) {
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
        <div className={styles.sectionHead}>
          <LogoMark size={16} />
          <h2 className={styles.sectionTitle}>제안</h2>
        </div>
        <div className={styles.proposalGrid}>
          {hasGoal ? null : <GoalCard />}
          <FeedCard icon="sparkle" hue="terracotta" title="먼저 제안받기">
            <p className={styles.proposalMessage}>내 기록과 새로 올라온 공고 · 공모전을 읽고, 지금 하면 좋은 일을 근거와 함께 권합니다.</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.proposalAction} onClick={() => setAsking(true)}>제안 켜기</button>
            </div>
          </FeedCard>
        </div>
        {error ? <p role="alert" className={styles.feedError}>{error}</p> : null}
        <Dialog open={asking} onOpenChange={(open) => { if (!pending) setAsking(open); }}>
          <DialogContent className={styles.enableDialog} showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className={styles.enableTitle}>제안을 켜기 전에</DialogTitle>
              <DialogDescription className={styles.enableIntro}>켜면 누르지 않아도 익스프레소가 AI를 실행합니다.</DialogDescription>
            </DialogHeader>
            <dl className={styles.enableFacts}>
              <div><Icon name="notebook" size={18} /><div><dt>읽는 것</dt><dd>내 구직 목표와 커리어 기록, 관심 공고, 새로 수집된 채용 공고와 공모전</dd></div></div>
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
  const useFallback = last.reason === "no_credits" && fallback.length > 0;

  return (
    <section className={styles.proposals}>
      <div className={styles.sectionHead}>
        <LogoMark size={16} />
        <h2 className={styles.sectionTitle}>제안</h2>
        {feed.proposals.length > 0 ? <span className={styles.sectionCount}>{feed.proposals.length}</span> : null}
        <span className={styles.sectionSpace} />
        {hasGoal ? <Link href={"/goal" as Route} className={styles.feedControl}><Icon name="target" size={13} />목표</Link> : null}
        <button type="button" className={styles.feedControl} disabled={working || pending} onClick={() => run(refreshProposalsAction)}>
          <Icon name="arrow-clockwise" size={13} />
          다시 받기
        </button>
        <button type="button" className={styles.feedControl} disabled={pending} onClick={() => run(disableProposalsAction)}>끄기</button>
      </div>

      {!working && last.reason ? <p className={styles.feedNote}>{REASON[last.reason]}</p> : null}
      {error ? <p role="alert" className={styles.feedError}>{error}</p> : null}

      <div className={styles.proposalGrid}>
        {hasGoal ? null : <GoalCard />}
        {working ? (
          <FeedCard icon="sparkle" hue="terracotta" title="제안을 준비하고 있습니다">
            <div className={styles.proposalSteps} role="status">
              <ToolStep
                status={last.stage === "writing" ? "complete" : "running"}
                icon="magnifying-glass"
                title={last.stage === "writing" ? "자료를 골랐습니다" : last.status === "queued" ? "곧 시작합니다" : "자료 고르는 중"}
                summary="내 기록 · 관심 공고 · 새 공고 · 공모전"
              />
              {last.stage === "writing" ? <ToolStep status="running" icon="pencil-simple-line" title="제안 쓰는 중" /> : null}
            </div>
          </FeedCard>
        ) : null}

        {feed.proposals.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} disabled={pending} onDismiss={() => run(() => dismissProposalAction(proposal.id))} />
        ))}

        {/* 크레딧이 남지 않았을 때 — 규칙으로 센 제안을 같은 틀에 세운다. */}
        {useFallback ? fallback.map((finding) => (
          <FeedCard key={finding.id} icon="lightbulb" hue="terracotta" title="지금 할 수 있는 일">
            <p className={styles.proposalMessage}>{finding.text}</p>
            <ul className={`${styles.rows} ${styles.proposalRefs}`}>
              {finding.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href as Route} className={styles.row}>
                    <span className={styles.rowBody}><span className={styles.rowTitle}>{item.label}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className={styles.proposalActions}><ProposalAction action={finding.action} /></div>
          </FeedCard>
        )) : null}
      </div>
    </section>
  );
}
