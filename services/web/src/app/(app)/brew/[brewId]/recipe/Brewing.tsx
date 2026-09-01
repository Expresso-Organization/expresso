"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";

import styles from "./Brewing.module.css";

/** 기록 하나가 들어가는 간격. 잔잔하게 — 기다리는 화면이지 게임이 아니다. */
const STEP_MS = 2_200;
/** 줄 서 있는 자리 수. 위로 갈수록 흐려지며 멀어진다. */
const SLOTS = 6;
/** 한 줄 높이. `.row` 의 높이와 같아야 자리가 맞는다. */
const ROW_PX = 34;
/** 윗줄이 늦게 따라붙는 시간. 이것 하나가 「같이 움직임」을 「파도」로 바꾼다. */
const WAVE_MS = 55;
/**
 * 수위가 오가는 구간과 걸음.
 *
 * 빈 잔에서 가득까지 다 쓰지 않는다 — 바닥까지 비면 잔이 꺼져 보이고, 끝까지
 * 차면 넘칠 자리가 없어 멈춘 그림이 된다. 20%에서 시작해 한 걸음에 20%씩,
 * 80%까지 세 걸음이다.
 */
const FILL_FROM = 0.2;
const FILL_STEP = 0.2;
const FILL_LAP = 3;
/**
 * 잔을 비우는 시점. **기록이 들어오는 사이의 빈 자리**다.
 *
 * 한 걸음은 2200ms 이고 그중 앞 950ms 는 기록이 내려오는 시간이다
 * (`--ex-fall`). 남는 1250ms 안에 비우는 동작(`--ex-drain`, 750ms)을 넣는다 —
 * 1150ms 에 시작해 1900ms 에 끝나므로 앞뒤로 200 · 300ms 가 빈다. 이 자리를
 * 벗어나면 기록이 들어오는 순간에 잔이 비어 둘이 부딪친다.
 */
const DRAIN_AT = 1_150;
/**
 * 아래 한 줄이 바뀌는 간격.
 *
 * 다섯 줄이 한 바퀴 도는 데 22.5초다. 첫 글자가 오기까지 실측 68~95초이므로
 * 서너 바퀴 돈다 — 더 빠르면 읽기도 전에 넘어가고, 더 느리면 화면이 멈춘 것
 * 같아진다.
 */
const STAGE_MS = 4_500;

/**
 * 구상하는 동안 아래에 서는 말.
 *
 * **단계가 아니다.** 모델이 어디까지 왔는지 우리는 모르고, 모르는 것을 순서로
 * 그리면 그건 지어낸 진행률이다. 이 다섯은 우리가 시킨 **한 가지 일**을 다섯
 * 갈래로 적은 것이고 — 무엇을 담을지 · 어떤 순서로 · 무슨 메시지로 · 무엇을
 * 빼는지(`RecipeV2Section` · `unusedSources`) — 어느 것이 떠 있든 그 순간
 * 사실이다.
 */
const STAGES: { text: string; needsPosting?: true }[] = [
  { text: "무엇을 담을지 구상하는 중입니다" },
  { text: "고른 기록을 공고 요건과 맞춰 보는 중입니다", needsPosting: true },
  { text: "어떤 순서로 놓을지 재는 중입니다" },
  { text: "섹션마다 핵심 메시지를 고르는 중입니다" },
  { text: "안 쓸 기록을 가려내는 중입니다" },
];

/** 회사 자리. `CompanyAvatar` 가 읽는 모양 그대로다 — 마크가 있으면 마크다. */
export interface ReadingCompany {
  name: string;
  initial?: string | null;
  avatarBackground?: string | null;
  avatarColor?: string | null;
  logoUrl?: string | null;
}

/** 짜기 전에 화면이 이미 아는 것. 기다리는 동안 보여 주는 것이 이것뿐이다. */
export interface Reading {
  posting: { title: string; company: ReadingCompany } | null;
  records: { recordId: string; title: string; categoryIcon: string; reason: string }[];
}

/**
 * 아직 한 글자도 안 왔을 때. 그림과, 그 그림이 무엇인지 적은 글.
 *
 * 지면을 위아래로 나눠 쓴다 — 잔과 제목은 화면 가운데, 겨냥한 공고와 안내는
 * 바닥이다. 2분 넘게 볼 화면에서 눈이 머무는 곳은 움직이는 잔이고, 한 번
 * 읽고 마는 글이 그 옆에 붙어 있으면 둘 다 어중간해진다.
 *
 * 세로로 늘어나는 일은 담는 칸(`.readingDoc`)이 한다.
 */
export function ReadingPanel({ queued, reading }: { queued: boolean; reading: Reading }) {
  return (
    <>
      <div className={styles.readingMain}>
        <Brewing records={reading.records} />
        <h1 className={styles.readingTitle}>레시피를 짜는 중</h1>
        {/* 제목이 「짜는 중」이면 바로 아래가 그 「중」이 지금 뭘 하고 있는지다. */}
        <p className={styles.stageRow}>
          {queued
            ? <span className={styles.stage}>차례를 기다리는 중입니다</span>
            : <Stage aiming={reading.posting !== null} />}
        </p>
      </div>
      <div className={styles.readingFoot}>
        {reading.posting ? (
          <span className={styles.posting}>
            <CompanyAvatar
              company={reading.posting.company}
              className={styles.postingMark}
              fit="line"
            />
            {/*
              * 마크가 있으면 이름을 적지 않는다 — 워드마크는 그 자체가 회사
              * 이름이라 옆에 또 쓰면 같은 말이 두 번 들어가고, 칩의 좁은 폭을
              * 두 번 쓰는 셈이다. 마크가 없는 회사는 이름이 유일한 표시라 이
              * 저장소가 공고를 적는 꼴 그대로 「회사 · 제목」을 쓴다.
              *
              * 마크의 `alt` 는 비어 있다(장식) — 눈으로 읽지 않는 쪽에는 회사가
              * 통째로 사라지므로 이름을 숨겨서 남긴다.
              */}
            <span className={styles.postingText}>
              {reading.posting.company.logoUrl ? (
                <>
                  <span className="ex-sr-only">{reading.posting.company.name} · </span>
                  {reading.posting.title}
                </>
              ) : (
                <><b>{reading.posting.company.name}</b> · {reading.posting.title}</>
              )}
            </span>
          </span>
        ) : null}
        <p className={styles.readingNote}>
          {reading.posting
            ? <>고른 기록 {reading.records.length}건을 이 공고에 맞춰 무엇을 어떤 순서로 담을지 정합니다.</>
            : <>고른 기록 {reading.records.length}건을 읽고 무엇을 어떤 순서로 담을지 정합니다.</>}
          {" "}2~3분 걸립니다. 이 화면을 닫아도 계속됩니다.
        </p>
      </div>
    </>
  );
}

/**
 * 구상하는 동안의 한 줄. `STAGES`를 돈다.
 *
 * **다섯 줄을 다 그린다.** 한 줄만 두고 글을 갈아 끼우면 말이 바뀔 때마다
 * 줄의 폭이 달라지고, 가운데 정렬이라 그만큼 좌우로 튄다. 겹쳐 두면 칸의
 * 폭을 가장 긴 줄이 잡아 아무것도 움직이지 않고 투명도만 오간다
 * (`Brewing.module.css`의 `.stage`).
 *
 * 살아 있는 자리를 읽어 주는 곳(`aria-live`)은 위의 상태 줄 하나다. 같은
 * 사실을 다른 말로 적은 이 줄까지 소리 내면 4.5초마다 같은 말이 반복된다.
 * 겹쳐 둔 나머지 넷은 눈에만 없는 것이 아니라 읽는 쪽에도 없어야 한다.
 */
function Stage({ aiming }: { aiming: boolean }) {
  const [at, setAt] = useState(0);
  const lines = STAGES.filter(({ needsPosting }) => !needsPosting || aiming);

  useEffect(() => {
    const timer = window.setInterval(() => setAt((n) => n + 1), STAGE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const on = at % lines.length;

  return (
    <span className={styles.stage}>
      {lines.map(({ text }, index) => (
        <span
          key={text}
          className={styles.stageLine}
          data-on={index === on ? "" : undefined}
          aria-hidden={index === on ? undefined : "true"}
        >
          {text}
        </span>
      ))}
    </span>
  );
}

/**
 * 재료가 잔으로 내려가는 동안.
 *
 * **실측 68~95초 동안 모델은 한 글자도 내놓지 않는다** — 생각이 끝나야 출력이
 * 시작되고, 그 출력이 곧 레시피다. `thinking`에는 분량만 실려 오고 글은 안
 * 온다(2026-09-01 실측, claude-code 2.1.237). 그러니 이 자리를 모델의 말로
 * 채울 방법은 없다.
 *
 * 대신 **우리가 이미 아는 것**을 쓴다 — 지금 모델에게 가 있는 기록들. 줄 서
 * 있다가 한 번에 하나씩 잔으로 내려가고, **내려가는 그 동안** 커피가 20%씩
 * 찬다. 80%까지 차면 **다음 기록이 오기 전 빈 자리에서** 잔을 비운다 — 들어오는
 * 순간에 비우면 방금 담은 것을 쏟아 버리는 그림이 된다.
 *
 * **진행률이 아니다.** 몇 초가 남았는지 우리도 모른다 — 차오르는 높이는 기록
 * 수를 도는 그림이고, 정직한 숫자는 위의 시계다.
 *
 * 잔은 **로고 마크 그대로**다. 원과 그 안을 채운 커피 — 이미 잔이라 따로 그릴
 * 것이 없고, 채우는 일은 그 마크의 `rect` 수면을 CSS 로 올리고 내려서 한다
 * (`Brewing.module.css`). 브랜드 컴포넌트는 손대지 않는다.
 */
function Brewing({ records }: { records: Reading["records"] }) {
  /** 몇 번째 기록까지 들어갔는가. 계속 는다 — 나머지로 자리를 정한다. */
  const [at, setAt] = useState(0);
  /** 이번 걸음에서 잔을 비웠는가. 기록이 들어온 뒤 다음 기록 전에만 선다. */
  const [drained, setDrained] = useState(false);
  const count = records.length;

  useEffect(() => {
    if (count === 0) return;
    const timer = window.setInterval(() => {
      setAt((n) => n + 1);
      // 새 기록이 들어오는 걸음이다 — 비운 자리는 여기서 풀린다.
      setDrained(false);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [count]);

  /** 한 바퀴에서 몇 번째 걸음인가. 마지막이 80%, 그 뒤가 비우는 자리다. */
  const lap = at === 0 ? -1 : (at - 1) % FILL_LAP;
  const full = lap === FILL_LAP - 1;

  useEffect(() => {
    if (!full) return;
    const timer = window.setTimeout(() => setDrained(true), DRAIN_AT);
    return () => window.clearTimeout(timer);
  }, [at, full]);

  if (count === 0) {
    return (
      <div className={styles.brew} aria-hidden="true">
        <span className={styles.bloom} />
        <span className={styles.mark}><LogoMark size={94} /></span>
      </div>
    );
  }

  /*
   * 보이는 자리와 그 자리에 설 기록.
   *
   * `seq` 가 열쇠다 — 한 칸 내려가도 **같은 DOM 노드**가 남아야 브라우저가
   * 그 사이를 이어 그린다. 자리마다 `key` 를 매기면 매번 새로 태어나 뚝뚝
   * 끊긴다. -1 은 잔 안이다: 방금 들어간 것이 풀리며 사라지는 자리.
   */
  const rows = [];
  for (let slot = -1; slot < SLOTS; slot += 1) {
    const seq = at + slot;
    rows.push({ seq, slot, record: records[((seq % count) + count) % count]! });
  }

  /** 40 · 60 · 80, 그리고 기록이 없는 사이에 20. 처음 잔도 20에서 시작한다. */
  const fill = at === 0 || drained ? FILL_FROM : FILL_FROM + (lap + 1) * FILL_STEP;

  return (
    <div className={styles.brew} aria-hidden="true">
      <div className={styles.lane}>
        {rows.map(({ seq, slot, record }) => (
          <span
            key={seq}
            className={styles.row}
            style={{
              transform: `translateY(${(SLOTS - 1 - slot) * ROW_PX}px) scale(${slot < 0 ? 0.62 : 1 - slot * 0.026})`,
              opacity: slot < 0 ? 0 : Math.max(0.06, 0.62 ** slot),
              filter: `blur(${slot < 0 ? 10 : Math.max(0, (slot - 0.4) * 0.7)}px)`,
              // 아래가 먼저 움직이고 위가 따라온다 — 줄을 타고 올라가는 파도.
              transitionDelay: `${Math.max(0, slot) * WAVE_MS}ms`,
            }}
          >
            <Icon name={record.categoryIcon} size={13} color="var(--ex-fg-faint)" />
            <span className={styles.rowText}>{record.title}</span>
          </span>
        ))}
      </div>

      <span className={styles.bloom} />
      {/*
        * 잔은 **한 노드로 남는다**. `key` 로 다시 태어나게 하면 브라우저가 이을
        * 앞 값이 없어 수위가 뚝 끊긴다. 받아 낼 때의 작은 반동은 그래서 같은
        * 애니메이션 둘을 번갈아 거는 것으로 다시 돌린다 — 이름이 그대로면
        * 클래스를 바꿔도 CSS 는 이미 끝난 것으로 보고 다시 돌지 않는다.
        */}
      <span
        className={[
          styles.mark,
          at % 2 === 0 ? styles.receiveA : styles.receiveB,
          drained ? styles.draining : "",
        ].join(" ")}
        style={{ "--ex-fill": fill } as CSSProperties}
      >
        <LogoMark size={94} />
      </span>
    </div>
  );
}
