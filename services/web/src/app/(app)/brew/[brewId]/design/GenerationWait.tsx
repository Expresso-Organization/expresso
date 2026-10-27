"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";

import { REQUIREMENT_KIND_LABEL } from "../requirement-kind";
import { Brewing, WAVE_MS, type BrewingRecord } from "./Brewing";
import { DesignThumb, type DesignCatalogEntry } from "./DesignCatalog";
import styles from "./GenerationWait.module.css";

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
 * 입력 묶음이 올라가는 빠르기(px/초).
 *
 * 읽히는 빠르기로 고른 값이다. 기록 카드 한 줄(약 120px)이 화면을 지나는 데 7초쯤 걸려, 제목과 한 줄 설명을
 * 읽을 시간이 있다. 사용자가 스크롤하면 멈춘다.
 */
const FEED_PX_PER_SECOND = 18;

/**
 * 생성을 맡긴 뒤 설계 출력이 오기까지.
 *
 * 위에는 고른 기록이 잔으로 내려가는 그림(`Brewing`)이 계속 서 있다. 처음 10초는 그 그림이 화면 가운데에
 * 있고, 그 뒤 위로 올라가며 아래에서 **입력 묶음**이 올라온다 — 채용 공고 · 디자인 · 섹션 · 기록을 구역마다
 * 카드로 그린 것. 설계 호출은 생각을 마쳐야 한 글자를 내고(2026-10-27 실측 약 61초), 그동안 화면이 정직하게
 * 보여 줄 수 있는 것은 모델에게 지금 가 있는 것뿐이다. 설계가 오면 `LivePreview`가 이 화면을 지면으로 바꾼다.
 *
 * 화면이 무엇을 하는 중인지 적는 문구는 두지 않는다. 그림과 입력이 그 일을 보여 준다.
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
  /** 넘어가기 직전 브루잉 그림의 자리와 결. 위로 올라간 뒤 그 자리에서부터 옮긴다(FLIP). */
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.animate(
      [{ transform: `translateY(${first.top - node.getBoundingClientRect().top}px)` }, { transform: "none" }],
      { duration: first.duration, easing: first.easing },
    );
  }, [entering]);

  useFeedLoop(feed, phase === "reading");

  return (
    <div className={styles.wait} data-phase={phase} data-entering={entering ? "" : undefined}>
      <div ref={top} className={styles.top}>
        <Brewing records={reading.records} />
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
          <article className={`${styles.card} ${styles.postingCard}`}>
            <CompanyAvatar company={{ name: posting.companyName }} className={styles.postingMark} />
            <div className={styles.cardBody}>
              <span className={styles.cardMeta}>{posting.companyName}</span>
              <h3 className={styles.cardTitle}>{posting.title}</h3>
            </div>
          </article>
          {posting.requirements.map((requirement, index) => (
            <article key={`${index}-${requirement.label}`} className={`${styles.card} ${styles.requirementCard}`}>
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
        <article className={`${styles.card} ${styles.designCard}`}>
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
        <article key={section.id} className={`${styles.card} ${styles.sectionCard}`}>
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
        <article key={record.recordId} className={`${styles.card} ${styles.recordCard}`}>
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
        <section key={group.key} className={styles.group} style={{ "--i": index } as CSSProperties} aria-label={group.label}>
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

/** 넘어가기 직전, 브루잉 그림의 위치와 잔이 내려가는 결(`--ex-fall` · `--ex-fall-ease`)을 잰다. 같은 결로 올린다. */
function measure(node: HTMLElement) {
  const cup = node.querySelector<HTMLElement>("[data-brew-cup]");
  const style = cup ? getComputedStyle(cup) : null;
  return {
    top: node.getBoundingClientRect().top,
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
 * 입력 묶음을 아래에서 위로 천천히 올린다. 같은 묶음 두 벌이 이어 서 있어, 첫 벌을 다 올리면 그만큼 되돌려
 * 끝없이 돈다.
 *
 * 사용자가 스크롤하면 멈추고, 스크롤이 끝나면(`scrollend`) 그 자리에서 다시 이어 간다. 우리가 쓴 값과
 * 다른 스크롤 위치가 읽히면 사용자가 움직인 것이다 — 휠 · 터치 · 스크롤바 · 키보드를 따로 듣지 않는다.
 * `scrollend`는 2025년 12월부터 주요 브라우저가 모두 지원한다(MDN Baseline 2025). 없는 브라우저에서는
 * 사용자가 한 번 스크롤한 뒤로 멈춘 채 남는다.
 *
 * 묶음이 화면보다 짧으면 돌지 않고, 두 번째 벌도 감춘다(`data-still`). 동작 줄이기 설정에서도 돌지 않는다.
 */
function useFeedLoop(feed: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const node = feed.current;
    if (!enabled || !node) return;
    const first = node.querySelector<HTMLElement>("[data-copy]")?.previousElementSibling as HTMLElement | null;
    const second = node.querySelector<HTMLElement>("[data-copy]");
    if (!first || !second) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let position = node.scrollTop;
    let written = position;
    let paused = false;
    let last = performance.now();
    let frame = 0;
    /** 두 번째 벌이 첫 벌과 같은 자리에 오기까지의 거리. 이만큼 올리면 처음과 같은 그림이다. */
    let period = 0;

    const fit = () => {
      period = second.offsetTop - first.offsetTop;
      const moving = !still && first.offsetHeight > node.clientHeight;
      if (moving) delete node.dataset.still;
      else node.dataset.still = "";
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(node);
    resize.observe(first);

    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      if (!paused && node.dataset.still === undefined && period > 0) {
        position += (FEED_PX_PER_SECOND * elapsed) / 1000;
        if (position >= period) position -= period;
        node.scrollTop = position;
        written = node.scrollTop;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const onScroll = () => {
      // 소수점 위치는 브라우저가 화면 픽셀로 맞춰 읽어 준다. 그 차이보다 크면 사람이 움직인 것이다.
      if (Math.abs(node.scrollTop - written) > 1) paused = true;
    };
    const onScrollEnd = () => {
      if (!paused) return;
      paused = false;
      position = node.scrollTop % (period || Infinity);
      written = node.scrollTop;
    };
    // 탭을 떠났다 돌아오면 그사이 시간만큼 한 번에 뛰지 않는다.
    const onVisible = () => { last = performance.now(); };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", onScrollEnd);
    document.addEventListener("visibilitychange", onVisible);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", onScrollEnd);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [feed, enabled]);
}
