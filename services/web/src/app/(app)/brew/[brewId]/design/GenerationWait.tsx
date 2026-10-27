"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";

import { REQUIREMENT_KIND_LABEL } from "../requirement-kind";
import { Brewing, WAVE_MS, type BrewingRecord } from "./Brewing";
import { DesignThumb, type DesignCatalogEntry } from "./DesignCatalog";
import { cubicBezier, FEED_MOVE_MS, FEED_STEP_MS, feedSnaps, nextSnap, parseCubicBezier } from "./feed-steps";
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
  { text: "레시피 섹션 확인 중..." },
];
const READING_LINES = ["포트폴리오 생성 중...", "지면 구성 설계 중...", "섹션별 형태 고르는 중...", "섹션별 분량 정하는 중..."];
/** 입력 묶음이 뜬 뒤 한 줄이 바뀌는 간격. 묶음이 세 칸 올라갈 때마다 한 번이라 읽기 전에 넘어가지 않는다. */
const READING_LINE_MS = FEED_STEP_MS * 3;

/**
 * 생성을 맡긴 뒤 설계 출력이 오기까지.
 *
 * 처음 10초는 고른 기록이 잔으로 내려가는 그림(`Brewing`)이 화면 가운데에 서고, 잔 아래에서 지금 읽는 입력을
 * 한 줄씩 짚는다. 그 뒤 기록 줄은 걷히고 잔만 위로 올라가며, 아래에서 **입력 묶음**이 올라온다 — 채용 공고 ·
 * 디자인 · 섹션 · 기록을 구역마다 카드로 그린 것. 묶음은 1.5초마다 다음 구역으로 한 칸씩 올라간다. 설계 호출은 생각을 마쳐야 한 글자를 내고(2026-10-27 실측 약 61초), 그동안 화면이 정직하게
 * 보여 줄 수 있는 것은 모델에게 지금 가 있는 것뿐이다. 설계가 오면 `LivePreview`가 이 화면을 지면으로 바꾼다.
 *
 * 남은 시간(`brewingLeftMs`)은 서버가 잡을 만든 시각에서 잰다. 다시 열었을 때 10초가 지났으면 처음부터
 * 입력 묶음이 서 있다.
 */
export function GenerationWait({
  reading,
  brewingLeftMs,
  actions,
}: {
  reading: WaitReading;
  brewingLeftMs: number;
  actions: ReactNode;
}) {
  const [phase, setPhase] = useState<"brewing" | "reading">(brewingLeftMs > 0 ? "brewing" : "reading");
  /** 브루잉에서 넘어온 입력 묶음인가. 처음부터 입력 묶음이면 올라오는 동작이 없다. */
  const [entering, setEntering] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  /** 넘어가기 직전 잔의 자리와 결. 위로 올라간 뒤 그 자리에서부터 옮긴다(FLIP). */
  const before = useRef<{ top: number; duration: number; easing: string } | null>(null);

  useEffect(() => {
    if (phase !== "brewing") return;
    const timer = window.setTimeout(() => {
      before.current = top.current ? measure(top.current) : null;
      setEntering(true);
      setPhase("reading");
    }, brewingLeftMs);
    return () => window.clearTimeout(timer);
  }, [phase, brewingLeftMs]);

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

  useFeedSteps(feed, phase === "reading");

  const brewingLines = BREWING_LINES.filter(({ needsPosting }) => !needsPosting || reading.posting).map(({ text }) => text);

  return (
    <div className={styles.wait} data-phase={phase} data-entering={entering ? "" : undefined}>
      <div ref={top} className={styles.top}>
        <Brewing records={reading.records} quiet={phase === "reading"} />
        {phase === "brewing"
          ? <Caption key="brewing" lines={brewingLines} every={BREWING_MS / brewingLines.length} />
          : <Caption key="reading" lines={READING_LINES} every={READING_LINE_MS} />}
      </div>
      <div className={styles.actions}>{actions}</div>
      {phase === "reading" ? (
        <div
          ref={feed}
          className={styles.feed}
          style={{ "--ex-wave": `${WAVE_MS}ms` } as CSSProperties}
          aria-label="지면 설계에 들어가는 입력"
          tabIndex={0}
        >
          <Inputs reading={reading} />
          {/* 끝에서 처음으로 이어지게 같은 묶음을 한 번 더 둔다. 읽는 쪽과 초점은 첫 묶음만 본다. */}
          <Inputs reading={reading} copy />
        </div>
      ) : null}
    </div>
  );
}

/** 입력 묶음 한 벌. 구역은 채용 공고 · 디자인 · 섹션 · 기록 순서다. 비어 있는 구역은 그리지 않는다. */
function Inputs({ reading, copy = false }: { reading: WaitReading; copy?: boolean }) {
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
    <div className={styles.inputs} data-copy={copy ? "" : undefined} aria-hidden={copy || undefined} inert={copy || undefined}>
      {groups.map((group, index) => (
        <section key={group.key} className={styles.group} style={{ "--i": index } as CSSProperties} aria-label={group.label} data-feed-group="">
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

/** 넘어가기 직전, 잔의 위치와 잔이 내려가는 결(`--ex-fall` · `--ex-fall-ease`)을 잰다. 같은 결로 올린다. */
function measure(node: HTMLElement) {
  const cup = node.querySelector<HTMLElement>("[data-brew-cup]");
  const style = cup ? getComputedStyle(cup) : null;
  return {
    top: (cup ?? node).getBoundingClientRect().top,
    duration: milliseconds(style?.getPropertyValue("--ex-fall") ?? ""),
    easing: style?.getPropertyValue("--ex-fall-ease").trim() || "ease",
  };
}

/** `950ms` · `0.95s`를 밀리초로. 못 읽으면 0이고, 그러면 옮기지 않고 바로 선다. */
function milliseconds(value: string): number {
  const text = value.trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  return text.endsWith("ms") ? number : number * 1000;
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
 * 입력 묶음을 1.5초마다 다음 구역으로 한 칸씩 올린다(`feed-steps.ts`). 같은 묶음 두 벌이 이어 서 있어, 첫 벌의
 * 끝을 지나면 그만큼 되돌려 끝없이 돈다.
 *
 * 한 칸은 0.6초에 끝나고, 곡선은 조금 지나쳤다가 돌아와 앉는 `--ex-motion-spring`의 곡선이다.
 *
 * 사용자가 스크롤하면 멈추고, 스크롤이 끝나면(`scrollend`) 그 자리에서 다시 센다. 우리가 쓴 값과 다른 스크롤
 * 위치가 읽히면 사용자가 움직인 것이다 — 휠 · 터치 · 스크롤바 · 키보드를 따로 듣지 않는다. `scrollend`는
 * 2025년 12월부터 주요 브라우저가 모두 지원한다(MDN Baseline 2025). 없는 브라우저에서는 사용자가 한 번
 * 스크롤한 뒤로 멈춘 채 남는다.
 *
 * 묶음이 화면보다 짧으면 움직이지 않고, 두 번째 벌도 감춘다(`data-still`). 동작 줄이기 설정에서도 움직이지 않는다.
 */
function useFeedSteps(feed: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const node = feed.current;
    if (!enabled || !node) return;
    const second = node.querySelector<HTMLElement>("[data-copy]");
    const first = second?.previousElementSibling as HTMLElement | null;
    if (!first || !second) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = cubicBezier(...(parseCubicBezier(getComputedStyle(node).getPropertyValue("--ex-motion-spring")) ?? [0, 0, 1, 1]));

    let snaps: number[] = [];
    /** 두 번째 벌이 첫 벌과 같은 자리에 오기까지의 거리. 이만큼 올리면 처음과 같은 그림이다. */
    let period = 0;
    let written = node.scrollTop;
    let paused = false;
    let timer = 0;
    let frame = 0;

    const fit = () => {
      // 위아래 끝을 흐리게 지우는 폭(`--feed-fade`)만큼은 읽히지 않으므로, 구역 제목이 그 아래에 서게 멈춘다.
      const fade = Number.parseFloat(getComputedStyle(node).getPropertyValue("--feed-fade")) || 0;
      period = within(second, node) - within(first, node);
      snaps = feedSnaps(
        [...first.querySelectorAll<HTMLElement>("[data-feed-group]")].map((group) => {
          const rows = new Map<number, number>();
          for (const card of group.querySelectorAll<HTMLElement>("[data-feed-card]")) {
            const cardTop = within(card, node);
            rows.set(cardTop, Math.max(rows.get(cardTop) ?? 0, cardTop + card.offsetHeight));
          }
          return {
            top: within(group, node) - fade,
            rows: [...rows].map(([rowTop, bottom]) => ({ top: rowTop - fade, bottom: bottom - fade })),
          };
        }),
        node.clientHeight - fade * 2,
      );
      if (!reduced && first.offsetHeight > node.clientHeight) delete node.dataset.still;
      else node.dataset.still = "";
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(node);
    resize.observe(first);

    const write = (value: number) => {
      node.scrollTop = value;
      written = node.scrollTop;
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(step, FEED_STEP_MS);
    };
    function step() {
      schedule();
      if (paused || node!.dataset.still !== undefined || period <= 0) return;
      window.cancelAnimationFrame(frame);
      const from = node!.scrollTop;
      const to = nextSnap(snaps, from, period);
      // 시작도 프레임 시각으로 잡는다. `performance.now()`와 섞으면 프레임 시각이 그보다 앞설 때 진행이 음수에 묶인다.
      let start = -1;
      const run = (now: number) => {
        if (paused) return;
        if (start < 0) start = now;
        const progress = Math.min(1, (now - start) / FEED_MOVE_MS);
        write(from + (to - from) * ease(progress));
        if (progress < 1) frame = window.requestAnimationFrame(run);
        // 다음 벌의 처음에 닿았으면 첫 벌의 처음으로 되돌린다. 두 벌이 같아 그림은 그대로다.
        else if (to >= period) write(node!.scrollTop - period);
      };
      frame = window.requestAnimationFrame(run);
    }
    const onScroll = () => {
      // 소수점 위치는 브라우저가 화면 픽셀로 맞춰 읽어 준다. 그 차이보다 크면 사람이 움직인 것이다.
      if (paused || Math.abs(node.scrollTop - written) <= 1) return;
      paused = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    const onScrollEnd = () => {
      if (!paused) return;
      paused = false;
      if (period > 0 && node.scrollTop >= period) write(node.scrollTop - period);
      else written = node.scrollTop;
      schedule();
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", onScrollEnd);
    schedule();
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", onScrollEnd);
    };
  }, [feed, enabled]);
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
