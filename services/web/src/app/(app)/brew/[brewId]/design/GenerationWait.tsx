"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";

import { REQUIREMENT_KIND_LABEL } from "../requirement-kind";
import { useRefreshWhile } from "../use-refresh-while";
import { Brewing, WAVE_MS, type BrewingRecord } from "./Brewing";
import { DesignThumb, type DesignCatalogEntry } from "./DesignCatalog";
import { cubicBezier, FEED_MOVE_MS, FEED_STEP_MS, feedSnaps, nextSnap, parseCubicBezier, parseMotion } from "./feed-steps";
import styles from "./GenerationWait.module.css";
import { BREWING_MS } from "./wait-timing";

/** 지면 설계가 읽는 것 가운데 화면이 이미 아는 것. 설계 출력이 오기 전에 보여 줄 수 있는 것이 이것뿐이다. */
export interface WaitReading {
  /** 겨냥한 공고와 그 공고에서 뽑은 요건. 공고 없이 시작한 제작이면 null이다. */
  posting: {
    title: string;
    companyName: string;
    requirements: { label: string; kind: keyof typeof REQUIREMENT_KIND_LABEL }[];
  } | null;
  /** 고른 디자인. 카탈로그에서 못 찾으면 null이고 그 구역만 빠진다. */
  design: Pick<DesignCatalogEntry, "code" | "name" | "description" | "traits" | "preview"> | null;
  sections: { id: string; title: string; purpose: string; points: readonly string[] }[];
  records: (BrewingRecord & { categoryName: string; reason: string })[];
}

/**
 * 잔 아래에 도는 한 줄.
 *
 * 처음 10초는 지금 모델에게 가 있는 입력을 하나씩 짚는다. 공고 없이 시작한 제작이면 공고 줄은 없다.
 * 입력 묶음이 뜬 뒤에는 그 입력으로 무엇을 하는 중인지 적는다. 둘 다 사용자가 정한 말이다(2026-10-27).
 */
const BREWING_LINES: { text: string; needsPosting?: true }[] = [
  { text: "사용자 기록 정리 중..." },
  { text: "디자인 스타일 확인 중..." },
  { text: "채용 공고 분석 중...", needsPosting: true },
  { text: "섹션 구성 확인 중..." },
];
/**
 * 구성(레시피)이 끝나기 전에 맡긴 생성. 지금 도는 것은 구성 잡이라, 그 잡이 하는 일을 적는다 — 무엇을 담을지 ·
 * 어떤 순서로 · 무슨 메시지로(`RecipeV2Section`). 단계가 아니라 한 가지 일을 나눠 적은 것이라 어느 줄이 떠 있어도
 * 그 순간 사실이다.
 */
const RECIPE_LINES: { text: string; needsPosting?: true }[] = [
  { text: "고른 기록 읽는 중..." },
  { text: "기록을 공고 요건과 맞추는 중...", needsPosting: true },
  { text: "담을 섹션 고르는 중..." },
  { text: "섹션 순서 정하는 중..." },
  { text: "섹션마다 핵심 메시지 고르는 중..." },
];
const READING_LINES = ["포트폴리오 생성 중...", "지면 구성 설계 중...", "섹션별 형태 고르는 중...", "섹션별 분량 정하는 중..."];
/** 입력 묶음이 뜬 뒤 한 줄이 바뀌는 간격. 지면에 구역이 세 번 올라올 때마다 한 번이라 읽기 전에 넘어가지 않는다. */
const READING_LINE_MS = FEED_STEP_MS * 3;

/**
 * 생성을 맡긴 뒤 설계 출력이 오기까지.
 *
 * 처음 10초는 고른 기록이 잔으로 내려가는 그림(`Brewing`)이 화면 가운데에 서고, 잔 아래에서 지금 읽는 입력을
 * 한 줄씩 짚는다. 그 뒤 기록 줄은 걷히고 잔만 위로 올라가며, 아래에서 빈 **지면**이 올라온다. 그 지면 위로
 * 입력 묶음 — 채용 공고 · 디자인 · 섹션 · 기록 — 이 1.5초마다 한 구역씩 올라와 쌓인다. 다 쌓이면 지면을 비우고
 * 다시 쌓는다. 설계 호출은 생각을 마쳐야 한 글자를 내고(2026-10-27 실측 약 61초), 그동안 화면이 정직하게
 * 보여 줄 수 있는 것은 모델에게 지금 가 있는 것뿐이다. 설계가 오면 `LivePreview`가 이 화면을 지면으로 바꾼다.
 *
 * 움직임은 반동 없이 끝에서 천천히 멈춘다(`--ex-motion-panel`의 곡선, 사용자 결정 2026-10-27 "너무 반동이 크다").
 *
 * 남은 시간(`brewingLeftMs`)은 서버가 잡을 만든 시각에서 잰다. 다시 열었을 때 10초가 지났으면 처음부터
 * 지면이 서 있다.
 */
export function GenerationWait({
  reading,
  brewingLeftMs,
  recipePending = false,
  actions,
}: {
  reading: WaitReading;
  brewingLeftMs: number;
  /**
   * 구성(레시피)이 끝나기 전에 맡긴 생성이고 구성 잡이 아직 도는가. 그동안은 지면에 올릴 섹션이 없으므로 브루잉이
   * 시간과 상관없이 가운데에 머물고, 1.5초마다 다시 읽어 구성이 끝나면 지금처럼 지면으로 넘어간다.
   */
  recipePending?: boolean;
  actions: ReactNode;
}) {
  // 구성을 기다리는 동안에는 시작한 지 10초가 지났어도 브루잉이다 — 지면에 올릴 섹션이 아직 없다.
  const [phase, setPhase] = useState<"brewing" | "reading">(brewingLeftMs > 0 || recipePending ? "brewing" : "reading");
  /** 브루잉에서 넘어온 입력 묶음인가. 처음부터 입력 묶음이면 올라오는 동작이 없다. */
  const [entering, setEntering] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  /** 넘어가기 직전 잔의 자리와 결. 위로 올라간 뒤 그 자리에서부터 옮긴다(FLIP). */
  const before = useRef<{ top: number; duration: number; easing: string } | null>(null);

  useRefreshWhile(recipePending);

  useEffect(() => {
    if (phase !== "brewing" || recipePending) return;
    const timer = window.setTimeout(() => {
      before.current = top.current && root.current ? measure(top.current, root.current) : null;
      setEntering(true);
      setPhase("reading");
    }, brewingLeftMs);
    return () => window.clearTimeout(timer);
  }, [phase, brewingLeftMs, recipePending]);

  useLayoutEffect(() => {
    const first = before.current;
    const node = top.current;
    if (!entering || !first || !node) return;
    before.current = null;
    const cup = node.querySelector<HTMLElement>("[data-brew-cup]");
    if (!cup || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // 칸이 줄고 위에 붙는 두 움직임을 잔 하나의 자리 차이로 한 번에 잇는다.
    node.animate(
      [{ transform: `translateY(${first.top - cup.getBoundingClientRect().top}px)` }, { transform: "none" }],
      { duration: first.duration, easing: first.easing },
    );
  }, [entering]);

  useSheetBuild(feed, phase === "reading", entering);

  const brewingLines = (recipePending ? RECIPE_LINES : BREWING_LINES)
    .filter(({ needsPosting }) => !needsPosting || reading.posting)
    .map(({ text }) => text);

  return (
    <div
      ref={root}
      className={styles.wait}
      data-phase={phase}
      data-entering={entering ? "" : undefined}
      style={{ "--ex-wave": `${WAVE_MS}ms` } as CSSProperties}
    >
      <div ref={top} className={styles.top}>
        <Brewing records={reading.records} quiet={phase === "reading"} />
        {phase === "brewing" && recipePending
          ? <Caption key="recipe" lines={brewingLines} every={READING_LINE_MS} />
          : phase === "brewing"
          ? <Caption key="brewing" lines={brewingLines} every={BREWING_MS / brewingLines.length} />
          : <Caption key="reading" lines={READING_LINES} every={READING_LINE_MS} />}
      </div>
      <div className={styles.actions}>{actions}</div>
      {phase === "reading" ? (
        <div className={styles.sheet}>
          <div ref={feed} className={styles.feed} aria-label="지면 설계에 들어가는 입력" tabIndex={0}>
            <Inputs reading={reading} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 입력 묶음. 구역은 채용 공고 · 디자인 · 섹션 · 기록 순서다. 비어 있는 구역은 그리지 않는다. */
function Inputs({ reading }: { reading: WaitReading }) {
  const groups: { key: string; icon: string; label: string; body: ReactNode }[] = [];

  if (reading.posting) {
    const { posting } = reading;
    groups.push({
      key: "posting",
      icon: "target",
      label: "채용 공고",
      body: (
        <>
          <article className={`${styles.card} ${styles.postingCard}`} data-feed-card="">
            <CompanyAvatar company={{ name: posting.companyName }} className={styles.postingMark} />
            <div className={styles.cardBody}>
              <span className={styles.cardMeta}>{posting.companyName}</span>
              <h3 className={styles.cardTitle}>{posting.title}</h3>
            </div>
          </article>
          {posting.requirements.map((requirement, index) => (
            <article key={`${index}-${requirement.label}`} className={`${styles.card} ${styles.requirementCard}`} data-feed-card="">
              <span className={styles.badge} data-kind={requirement.kind}>{REQUIREMENT_KIND_LABEL[requirement.kind]}</span>
              <p className={styles.requirementText}>{requirement.label}</p>
            </article>
          ))}
        </>
      ),
    });
  }

  if (reading.design) {
    const { design } = reading;
    groups.push({
      key: "design",
      icon: "palette",
      label: "디자인",
      body: (
        <article className={`${styles.card} ${styles.designCard}`} data-feed-card="">
          <span className={styles.designThumb}>
            <DesignThumb code={design.code} name={design.name} preview={design.preview} />
          </span>
          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>{design.name}</h3>
            <p className={styles.cardText}>{design.description}</p>
            {design.traits.length ? (
              <span className={styles.traits}>
                {design.traits.map((trait) => <span key={trait} className={styles.trait}>{trait}</span>)}
              </span>
            ) : null}
          </div>
        </article>
      ),
    });
  }

  if (reading.sections.length) {
    groups.push({
      key: "sections",
      icon: "list-numbers",
      label: "섹션",
      body: reading.sections.map((section, index) => (
        <article key={section.id} className={`${styles.card} ${styles.sectionCard}`} data-feed-card="">
          <span className={styles.sectionNo}>{String(index + 1).padStart(2, "0")}</span>
          <h3 className={styles.cardTitle}>{section.title}</h3>
          <p className={styles.cardText}>{section.purpose}</p>
          {section.points.length ? (
            <ul className={styles.points}>
              {section.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          ) : null}
        </article>
      )),
    });
  }

  if (reading.records.length) {
    groups.push({
      key: "records",
      icon: "stack",
      label: "기록",
      body: reading.records.map((record) => (
        <article key={record.recordId} className={`${styles.card} ${styles.recordCard}`} data-feed-card="">
          <span className={styles.recordIcon}>
            <Icon name={record.categoryIcon} size={15} color="var(--ex-accent-text)" />
          </span>
          <div className={styles.cardBody}>
            <span className={styles.cardMeta}>{record.categoryName}</span>
            <h3 className={styles.cardTitle}>{record.title}</h3>
            <p className={styles.cardText}>{record.reason}</p>
          </div>
        </article>
      )),
    });
  }

  return (
    <div className={styles.inputs}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group} aria-label={group.label} data-feed-group="">
          <h2 className={styles.groupLabel}>
            <Icon name={group.icon} size={14} color="var(--ex-fg-subtle)" />
            {group.label}
          </h2>
          <div className={styles.grid} data-group={group.key}>{group.body}</div>
        </section>
      ))}
    </div>
  );
}

/** 넘어가기 직전, 잔의 위치와 지면이 올라오는 결(`--wait-rise`)을 잰다. 잔도 같은 결로 올린다. */
function measure(node: HTMLElement, root: HTMLElement) {
  const cup = node.querySelector<HTMLElement>("[data-brew-cup]");
  return { top: (cup ?? node).getBoundingClientRect().top, ...parseMotion(getComputedStyle(root).getPropertyValue("--wait-rise")) };
}

/**
 * 돌아가는 한 줄. 줄을 모두 겹쳐 세워 가장 긴 줄이 폭을 잡는다 — 한 줄만 두고 글을 갈아 끼우면 말이 바뀔
 * 때마다 폭이 달라져 가운데 정렬이 좌우로 튄다. 지금 줄만 읽는 쪽에 남는다.
 */
function Caption({ lines, every }: { lines: readonly string[]; every: number }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setAt((n) => n + 1), every);
    return () => window.clearInterval(timer);
  }, [every]);
  const on = at % lines.length;
  return (
    <p className={styles.caption}>
      {lines.map((line, index) => (
        <span key={line} className={styles.captionLine} data-on={index === on ? "" : undefined} aria-hidden={index === on ? undefined : "true"}>
          {line}
        </span>
      ))}
    </p>
  );
}

/**
 * 지면에 구역을 1.5초마다 하나씩 올린다.
 *
 * 한 번에 하는 일은 하나다(`FEED_STEP_MS`마다).
 * 1. 이미 올린 구역 가운데 아직 끝까지 안 보인 카드 줄이 있으면 그 줄이 보이게 지면 안을 올린다.
 * 2. 없으면 다음 구역을 올리고(`data-shown`), 그 구역이 칸 아래로 넘치면 아래 끝이 보이게 지면 안을 올린다.
 *    칸보다 긴 구역은 위 끝에 맞춘다.
 * 3. 다 올렸으면 지면을 비우고(`data-turning` 뒤 처음으로) 다시 쌓는다.
 *
 * 지면 안을 올리는 데는 0.6초, 곡선은 반동 없는 `--ex-motion-panel`이다.
 *
 * 사용자가 스크롤하면 멈추고, 남은 구역을 모두 보여 준다 — 손으로 읽는 동안 빈 자리가 나오면 안 된다.
 * 스크롤이 끝나면(`scrollend`) 그 자리에서 1번부터 이어 간다. 우리가 쓴 값과 다른 스크롤 위치가 읽히면 사용자가
 * 움직인 것이다. `scrollend`는 2025년 12월부터 주요 브라우저가 모두 지원한다(MDN Baseline 2025).
 *
 * 동작 줄이기 설정에서는 처음부터 모두 보이고 움직이지 않는다.
 */
function useSheetBuild(feed: RefObject<HTMLDivElement | null>, enabled: boolean, entering: boolean) {
  useEffect(() => {
    const node = feed.current;
    if (!enabled || !node) return;
    const groups = [...node.querySelectorAll<HTMLElement>("[data-feed-group]")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = node.closest<HTMLElement>("[data-phase]") ?? node;
    const ease = cubicBezier(...(parseCubicBezier(getComputedStyle(node).getPropertyValue("--ex-motion-panel")) ?? [0, 0, 1, 1]));

    // 구역 안의 제목과 카드가 위에서부터 `--ex-wave` 간격으로 따라 올라오도록 순서를 매긴다.
    for (const group of groups)
      [...group.querySelectorAll<HTMLElement>(":scope > h2, [data-feed-card]")].forEach((item, index) => item.style.setProperty("--j", String(index)));

    let shown = 0;
    let written = node.scrollTop;
    let paused = false;
    let timer = 0;
    let turn = 0;
    let frame = 0;

    const reveal = (count: number) => {
      shown = count;
      groups.forEach((group, index) => {
        if (index < count) group.dataset.shown = "";
        else delete group.dataset.shown;
      });
    };
    if (reduced) {
      reveal(groups.length);
      return;
    }
    node.dataset.building = "";

    /** 위아래 끝을 흐리게 지우는 폭(`--feed-fade`)과 그 안쪽 읽히는 높이. */
    const view = () => {
      const fade = Number.parseFloat(getComputedStyle(node).getPropertyValue("--feed-fade")) || 0;
      return { fade, visible: node.clientHeight - fade * 2, max: node.scrollHeight - node.clientHeight };
    };
    const write = (value: number) => {
      node.scrollTop = value;
      written = node.scrollTop;
    };
    const move = (to: number) => {
      window.cancelAnimationFrame(frame);
      const from = node.scrollTop;
      const target = Math.max(0, Math.min(to, view().max));
      if (Math.abs(target - from) < 1) return;
      // 시작도 프레임 시각으로 잡는다. `performance.now()`와 섞으면 프레임 시각이 그보다 앞설 때 진행이 음수에 묶인다.
      let start = -1;
      const run = (now: number) => {
        if (paused) return;
        if (start < 0) start = now;
        const progress = Math.min(1, (now - start) / FEED_MOVE_MS);
        write(from + (target - from) * ease(progress));
        if (progress < 1) frame = window.requestAnimationFrame(run);
      };
      frame = window.requestAnimationFrame(run);
    };

    const step = () => {
      const { fade, visible } = view();
      const scrolled = node.scrollTop;
      // 1. 올린 구역에 아직 다 안 보인 줄이 있으면 그 줄로.
      const revealed = groups.slice(0, shown).map((group) => {
        const rows = new Map<number, number>();
        for (const card of group.querySelectorAll<HTMLElement>("[data-feed-card]")) {
          const cardTop = within(card, node);
          rows.set(cardTop, Math.max(rows.get(cardTop) ?? 0, cardTop + card.offsetHeight));
        }
        return { top: within(group, node) - fade, rows: [...rows].map(([rowTop, bottom]) => ({ top: rowTop - fade, bottom: bottom - fade })) };
      });
      const lastBottom = revealed.at(-1)?.rows.reduce((bottom, row) => Math.max(bottom, row.bottom), 0) ?? 0;
      if (lastBottom > scrolled + visible + 1) {
        move(nextSnap(feedSnaps(revealed, visible), scrolled, lastBottom - visible));
        return;
      }
      // 2. 다음 구역을 올린다.
      const next = groups[shown];
      if (next) {
        reveal(shown + 1);
        const groupTop = within(next, node) - fade;
        const groupBottom = groupTop + next.offsetHeight;
        if (groupBottom > scrolled + visible) move(next.offsetHeight > visible ? groupTop : groupBottom - visible);
        return;
      }
      // 3. 지면을 비우고 처음부터.
      node.dataset.turning = "";
      turn = window.setTimeout(() => {
        if (paused) return;
        node.dataset.resetting = "";
        reveal(0);
        write(0);
        delete node.dataset.turning;
        void node.offsetHeight;
        delete node.dataset.resetting;
      }, FEED_MOVE_MS);
    };
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!paused) step();
        schedule(FEED_STEP_MS);
      }, delay);
    };

    const onScroll = () => {
      // 소수점 위치는 브라우저가 화면 픽셀로 맞춰 읽어 준다. 그 차이보다 크면 사람이 움직인 것이다.
      if (paused || Math.abs(node.scrollTop - written) <= 1) return;
      paused = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(turn);
      delete node.dataset.turning;
      reveal(groups.length);
    };
    const onScrollEnd = () => {
      if (!paused) return;
      paused = false;
      written = node.scrollTop;
      schedule(FEED_STEP_MS);
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", onScrollEnd);
    // 브루잉에서 넘어왔으면 빈 지면이 다 올라온 뒤 첫 구역을 올린다. 다시 열었으면 바로 올린다.
    schedule(entering ? parseMotion(getComputedStyle(root).getPropertyValue("--wait-rise")).duration : 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(turn);
      window.cancelAnimationFrame(frame);
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", onScrollEnd);
    };
  }, [feed, enabled, entering]);
}

/**
 * 칸 안 스크롤 좌표에서 요소의 위쪽 끝. `offsetTop`을 칸까지 거슬러 더한다 — 올라오는 동작(`transform`)이 걸린
 * 구역은 그 안 카드의 기준이 되지만 자리를 옮기지는 않으므로, 동작 중에 재도 값이 같다.
 */
function within(element: HTMLElement, container: HTMLElement): number {
  let top = 0;
  let at: HTMLElement | null = element;
  while (at && at !== container) {
    top += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return top;
}
