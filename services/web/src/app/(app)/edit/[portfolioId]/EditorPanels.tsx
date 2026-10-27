"use client";

import type {
  BlockStyle,
  GeneratedPage,
  PortfolioBlock,
  PortfolioRevision,
} from "@expresso/contracts";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";

import type { EditorCheckpoint } from "./Editor";
import {
  applyProposalAction,
  careerRecordOptionsAction,
  editBlockAction,
  historyAction,
  insertRecordAction,
  instructAction,
  restorePageAction,
  revisionsAction,
  type EditResult,
  type HistoryResult,
} from "./edit-actions";

import styles from "./page.module.css";

const BLOCK_KIND_LABEL: Record<string, string> = {
  heading: "제목",
  paragraph: "문단",
  list: "목록",
  metric: "수치",
  media: "이미지",
};

/**
 * 04 채팅 탭 — 말로 고치는 것이 기본, 직접 편집은 보조.
 *
 * 계약이 내는 것은 **제안**이다(§8.3 부분 편집). 바뀐 자리마다 patch가 하나씩
 * 오고, 사용자가 보고 "그대로 두기"를 눌러야 반영된다. 지면 변형은 대상이
 * 달라서 계약도 다르다 — 그래서 화면에서도 대상을 먼저 고른다.
 */
export function ChatPanel({
  portfolioId,
  blocks,
  freePage = false,
  structured = false,
  initialTarget = null,
}: {
  portfolioId: string;
  /** 캔버스에서 「이 부분만 AI에게」로 고른 블록. 고칠 수 없는 블록이면 기본 대상으로 연다. */
  initialTarget?: string | null;
  /** 말로 고칠 수 있는 블록. 미디어는 없고, 잠근 것은 계약이 거절한다. */
  blocks: { id: string; label: string }[];
  /** 자유 HTML이 최종 지면이면 블록 대신 페이지 전체를 새 판으로 고친다. */
  freePage?: boolean;
  structured?: boolean;
}) {
  const [result, instruct, pending] = useActionState<EditResult, FormData>(
    instructAction, {},
  );
  const [applied, apply, applying] = useActionState<EditResult, FormData>(
    applyProposalAction, {},
  );
  const [target, setTarget] = useState(
    freePage
      ? "page"
      : initialTarget && blocks.some(({ id }) => id === initialTarget)
        ? initialTarget
        : (blocks[0]?.id ?? "layout"),
  );
  const isBlockTarget = !freePage && target !== "layout";
  const targetLabel = target === "page"
    ? (structured ? "지면 구성" : "웹페이지 전체")
    : target === "layout"
      ? "지면 전체"
      : blocks.find(({ id }) => id === target)?.label ?? "블록";
  const kept = applied.error === undefined && !applying && result.proposalId === undefined;

  return (
    <>
      <div className={styles.chat}>
        {result.instruction ? (
          <>
            <div className={styles.userTurn}>
              <span className={styles.targetChip}>
                <Icon name="cursor-click" size={10} color="#4562CE" />
                <span className={styles.targetChipText}>{result.target}</span>
              </span>
              <div className={styles.userBubble}>{result.instruction}</div>
            </div>

            <div className={styles.aiTurn}>
              <span className={styles.aiAvatar}>
                <span className={styles.aiAvatarDot} />
              </span>
              <div className={styles.aiBody}>
                <div className={styles.aiNameRow}>
                  <span className={styles.aiName}>에스프레소</span>
                </div>

                {result.error ? (
                  <div className={styles.aiBubble}>{result.error}</div>
                ) : null}

                {/* 지면 변형은 바로 적용된다. 되돌리기는 03에서 옛 후보를 고르는 일. */}
                {result.layoutRationale ? (
                  <div className={styles.aiBubble}>{result.layoutRationale}</div>
                ) : null}

                {result.pageRationale ? (
                  <div className={styles.aiBubble}>
                    판 {Number(result.pageRevision ?? 0) + 1}을 만들었습니다. {result.pageRationale}
                  </div>
                ) : null}

                {result.patches && result.patches.length > 0 ? (
                  <div className={styles.patch}>
                    <div className={styles.patchHead}>
                      <Icon name="git-diff" size={11} color="var(--ex-fg-muted)" />
                      <span className={styles.patchTitle}>
                        바뀐 곳 {result.patches.length}
                      </span>
                    </div>
                    <div className={styles.patchRows}>
                      {result.patches.map((row) => (
                        <div key={row.path} className={styles.patchRow}>
                          <span className={styles.patchLabel}>{row.label}</span>
                          <span className={styles.patchValues}>
                            <span className={styles.patchBefore}>{row.before}</span>
                            <Icon name="arrow-right" size={9} color="var(--ex-border-firm)" />
                            <span className={styles.patchAfter}>{row.after}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.proposalId ? (
                  <form action={apply} className={styles.patchActions}>
                    <input type="hidden" name="portfolioId" value={portfolioId} />
                    <input type="hidden" name="proposalId" value={result.proposalId} />
                    <span className={styles.revertButton}>
                      {/* 적용하지 않으면 제안은 한 시간 뒤 사라진다 */}
                      <Icon name="clock" size={11} />
                      두면 사라집니다
                    </span>
                    <button type="submit" className={styles.keepButton} disabled={applying}>
                      <Icon name="check" size={11} />
                      {applying ? "반영 중…" : "그대로 두기"}
                    </button>
                  </form>
                ) : null}
                {applied.error ? (
                  <div className={styles.aiBubble}>{applied.error}</div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.chatHint}>
            <Icon name="cursor-click" size={12} color="#A39B8C" />
            <span className={styles.chatHintText}>
              {structured ? "배치와 사례 구성을 요청해 주세요. 문장은 속성 탭에서 편집할 수 있습니다." : "고칠 곳을 고르고 말해주세요. 바꾸기 전에 무엇이 바뀌는지 먼저 보여드립니다."}
            </span>
          </div>
        )}
        {kept && applied.error === undefined && result.proposalId === undefined
          && result.patches !== undefined ? null : null}
      </div>

      <form action={instruct} className={styles.chatComposer}>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="targetLabel" value={targetLabel} />
        <div className={styles.quickRow}>
          <select
            className={styles.quick}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-label="고칠 대상"
          >
            {freePage ? (
              <option value="page">{structured ? "지면 구성" : "웹페이지 전체"}</option>
            ) : (
              <>
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>{block.label}</option>
                ))}
                <option value="layout">지면 전체</option>
              </>
            )}
          </select>
        </div>
        <div className={styles.inputBox}>
          <input
            name="instruction"
            onKeyDown={(event) => {
              // ⌘↵ · Ctrl↵로도 보낸다. 한글 조합 중의 Enter는 글자를 끝내는 것이다.
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className={styles.input}
            placeholder={target === "page" || target === "layout"
              ? "더 차분하게 · 여백을 줄여 주세요"
              : "한 문장으로 줄여 주세요"}
            aria-label="편집 지시"
            required
          />
          <div className={styles.inputActions}>
            <span className={styles.inputShortcut}>⌘↵</span>
            <button
              type="submit"
              className={styles.inputSend}
              aria-label="보내기"
              disabled={pending}
            >
              <Icon name={pending ? "hourglass" : "arrow-up"} size={14} color="var(--ex-fg-on-accent)" />
            </button>
          </div>
        </div>
      </form>
      {isBlockTarget ? <RecordImport portfolioId={portfolioId} blockId={target} /> : null}
    </>
  );
}

/**
 * 04 「내 커리어에서 가져오기」 — 고른 블록의 글을 내 기록 본문으로 바꾼다.
 * 기록 목록은 처음 펼칠 때 읽는다.
 */
function RecordImport({ portfolioId, blockId }: { portfolioId: string; blockId: string }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<{ id: string; title: string }[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, run, running] = useActionState(insertRecordAction, {});
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || records !== null) return;
    let alive = true;
    careerRecordOptionsAction()
      .then((rows) => { if (alive) setRecords(rows); })
      .catch(() => { if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [open, records]);

  if (!open) {
    return (
      <button type="button" className={styles.recordImportToggle} onClick={() => setOpen(true)}>
        <Icon name="tray-arrow-down" size={12} />
        내 커리어에서 가져오기
      </button>
    );
  }

  return (
    <form
      className={styles.recordImport}
      action={(formData) => startTransition(() => run(formData))}
    >
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="blockId" value={blockId} />
      {loadFailed ? (
        <p className={styles.panelError}>기록을 불러오지 못했습니다.</p>
      ) : records === null ? (
        <p className={styles.panelEmpty}>기록을 불러오는 중입니다.</p>
      ) : records.length === 0 ? (
        <p className={styles.panelEmpty}>본문이 있는 기록이 없습니다.</p>
      ) : (
        <>
          <select name="recordId" className={styles.quick} aria-label="가져올 기록" defaultValue="">
            <option value="" disabled>기록을 고르세요</option>
            {records.map((record) => (
              <option key={record.id} value={record.id}>{record.title}</option>
            ))}
          </select>
          <button type="submit" className={styles.keepButton} disabled={running}>
            {running ? "바꾸는 중…" : "이 기록 글로 바꾸기"}
          </button>
        </>
      )}
      {result.error ? <p className={styles.panelError}>{result.error}</p> : null}
      {result.done ? <p className={styles.panelEmpty}>블록 글을 기록 본문으로 바꿨습니다. 이 블록은 기록과 이어져 잠깁니다.</p> : null}
    </form>
  );
}

/** 자유 HTML의 자동 검사는 판정이 아니라 사용자가 볼 참고 정보다. */
export function FreePageProperties({ page }: { page: GeneratedPage }) {
  const attention = page.qaReport.checks.filter(({ status }) => status === "fail");
  return (
    <div className={styles.properties}>
      <div className={styles.targetCard}>
        <Icon name="code" size={15} color="#354DA8" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.targetName}>{page.generationManifest?.structured ? "구조화 지면" : "자유 HTML"} · 판 {page.revision + 1}</div>
          <div className={styles.targetPath}>사용자가 요청할 때만 새 판을 만듭니다</div>
        </div>
      </div>
      <div className={styles.propGroup}>
        <div className={styles.propGroupHead}>
          <span className={styles.propGroupLabel}>생성 메모</span>
          <span className={styles.propGroupRule} />
        </div>
        <p className={styles.panelEmpty}>{page.rationale}</p>
      </div>
      <div className={styles.propGroup}>
        <div className={styles.propGroupHead}>
          <span className={styles.propGroupLabel}>확인할 곳</span>
          <span className={styles.propGroupRule} />
        </div>
        {attention.length === 0 ? (
          <p className={styles.panelEmpty}>
            편집 주의점이 없습니다. 필요하면 채팅에서 수정을 요청하세요.
          </p>
        ) : attention.map((check) => (
          <p key={check.name} className={styles.panelEmpty}>{check.detail}</p>
        ))}
      </div>
    </div>
  );
}

/** 자유 HTML 이력은 원본을 지우지 않고 쌓인 판 목록이다. */
export function FreePageHistoryPanel({ pages, portfolioId }: { pages: readonly GeneratedPage[]; portfolioId: string }) {
  const [result, run, running] = useActionState(restorePageAction, {});
  const current = pages[0]?.revision ?? 0;
  return (
    <div className={styles.history}>
      {result.error ? <p className={styles.panelError}>{result.error}</p> : null}
      {pages.map((page, index) => (
        <div key={page.id} className={styles.revision}>
          <span className={index === 0 ? styles.revisionAi : styles.revisionUser}>
            {page.revision + 1}
          </span>
          <div className={styles.revisionBody}>
            <div className={styles.revisionSummary}>판 {page.revision + 1}</div>
            <div className={styles.revisionMeta}>
              {new Date(page.createdAt).toLocaleString("ko-KR")}
              {index === 0 ? " · 현재" : ""}
            </div>
          </div>
          {index === 0 ? null : (
            <form action={run}>
              <input type="hidden" name="portfolioId" value={portfolioId} />
              <input type="hidden" name="revision" value={page.revision} />
              <input type="hidden" name="expectedRevision" value={current} />
              <button type="submit" className={styles.revisionRevert} disabled={running}>
                이 판으로 되돌리기
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}


/**
 * 04b 속성 탭 — 고른 블록을 직접 고친다.
 *
 * 고칠 수 있는 자리는 **블록 종류가 정한다** — 문단은 글 한 칸, 수치는 값과 라벨이다.
 * 크기 · 굵기 · 기울임 · 취소선 · 색 · 형광 · 정렬 · 줄 간격을 고칠 수 있다. 담기는
 * 값은 px도 hex도 아니라 **지면이 정한 타입 계단의 칸**과 **팔레트 이름**이다 —
 * 그래서 지면을 갈아도 이 블록의 크기와 색이 새 지면을 따라간다.
 *
 * 직접 고친 자리는 잠긴다. 다시 추출해도 덮이지 않고, 대신 말로 고치기의 대상에서
 * 빠진다(§8.3).
 */

/** 블록 종류마다 고칠 수 있는 칸. 서버의 EDITABLE_PATHS와 같은 표다. */
const EDITABLE_FIELDS: Record<string, { path: string; label: string; multiline: boolean }[]> = {
  heading: [{ path: "content.text", label: "제목", multiline: false }],
  paragraph: [{ path: "content.text", label: "글", multiline: true }],
  list: [{ path: "content.text", label: "항목", multiline: true }],
  metric: [
    { path: "content.value", label: "값", multiline: false },
    { path: "content.label", label: "라벨", multiline: false },
  ],
};

/** 지면 타입 계단. 가운데가 step0이고, 사용자는 이 칸 위에서 고른다. */
export const SIZE_STEPS = ["step-1", "step0", "step1", "step2", "step3", "step4"] as const;

const WEIGHTS = [
  { value: "normal", label: "보통" },
  { value: "medium", label: "중간" },
  { value: "semibold", label: "굵게" },
  { value: "bold", label: "더 굵게" },
] as const;

/** 팔레트 이름. 실제 색은 지면이 정한다 — 지면을 갈면 이 블록 색도 따라간다. */
const COLORS = [
  { value: "inherit", label: "지면 그대로", swatch: null },
  { value: "ink", label: "본문색", swatch: "var(--pf-ink, #16223A)" },
  { value: "accent", label: "강조색", swatch: "var(--pf-accent, #9A4030)" },
  { value: "muted", label: "흐린색", swatch: "var(--pf-muted, #8A94A6)" },
] as const;

const ALIGNMENTS = [
  { value: "start", label: "왼쪽", icon: "align-left-simple" },
  { value: "center", label: "가운데", icon: "align-center-horizontal-simple" },
  { value: "end", label: "오른쪽", icon: "align-right-simple" },
] as const;

const SPACINGS = [
  { value: "compact", label: "좁게" },
  { value: "normal", label: "보통" },
  { value: "wide", label: "넓게" },
] as const;

/** 지면이 이 종류에 준 크기. 스테퍼는 여기서 출발한다. */
export function baseStep(blockClasses: string | undefined): (typeof SIZE_STEPS)[number] {
  const found = /text-(step-1|step[0-4])/.exec(blockClasses ?? "");
  return (found?.[1] as (typeof SIZE_STEPS)[number]) ?? "step0";
}

/**
 * 크기 · 굵기 · 기울임 · 취소선 · 색 · 형광 — 04b 패널과 캔버스 툴바가 함께 쓴다.
 *
 * 담기는 값은 px도 hex도 아니다. **지면이 정한 계단의 칸**과 **팔레트 이름**이다.
 * 그래서 지면을 갈아도 이 블록의 크기와 색이 새 지면을 따라간다.
 */
export function StyleControls({
  portfolioId,
  block,
  layoutStep,
  run,
  running,
  compact,
}: {
  portfolioId: string;
  block: PortfolioBlock;
  layoutStep: (typeof SIZE_STEPS)[number];
  run: (formData: FormData) => void;
  running: boolean;
  compact?: boolean;
}) {
  const style = block.style as BlockStyle;
  const size = style.size ?? layoutStep;
  const index = SIZE_STEPS.indexOf(size);

  function set(patch: BlockStyle) {
    const formData = new FormData();
    formData.set("portfolioId", portfolioId);
    formData.set("blockId", block.id);
    formData.set("style", JSON.stringify(patch));
    run(formData);
  }

  const stepper = (
    <span className={styles.stepper} role="group" aria-label="크기">
      <button
        type="button"
        className={styles.stepperButton}
        aria-label="크기 줄이기"
        disabled={running || index <= 0}
        onClick={() => set({ size: SIZE_STEPS[index - 1] })}
      >
        −
      </button>
      <span className={styles.stepperValue} title="지면이 정한 타입 계단의 칸">
        {index + 1}
      </span>
      <button
        type="button"
        className={`${styles.stepperButton} ${styles.stepperRight}`}
        aria-label="크기 키우기"
        disabled={running || index >= SIZE_STEPS.length - 1}
        onClick={() => set({ size: SIZE_STEPS[index + 1] })}
      >
        ＋
      </button>
    </span>
  );

  const marks = (
    <>
      <button
        type="button"
        className={`${styles.toolButton} ${style.weight === "bold" || style.weight === "semibold" ? styles.toolButtonOn : ""}`}
        aria-label="굵게"
        aria-pressed={style.weight === "semibold" || style.weight === "bold"}
        disabled={running}
        onClick={() => set({ weight: style.weight === "semibold" || style.weight === "bold" ? "normal" : "semibold" })}
      >
        <Icon name="text-b" size={13} color={style.weight === "semibold" || style.weight === "bold" ? "#354DA8" : "var(--ex-fg-body)"} />
      </button>
      <button
        type="button"
        className={`${styles.toolButton} ${style.italic ? styles.toolButtonOn : ""}`}
        aria-label="기울임"
        aria-pressed={style.italic === true}
        disabled={running}
        onClick={() => set({ italic: !style.italic })}
      >
        <Icon name="text-italic" size={13} color={style.italic ? "#354DA8" : "var(--ex-fg-body)"} />
      </button>
      <button
        type="button"
        className={`${styles.toolButton} ${style.strike ? styles.toolButtonOn : ""}`}
        aria-label="취소선"
        aria-pressed={style.strike === true}
        disabled={running}
        onClick={() => set({ strike: !style.strike })}
      >
        <Icon name="text-strikethrough" size={13} color={style.strike ? "#354DA8" : "var(--ex-fg-body)"} />
      </button>
    </>
  );

  const swatches = (
    <span className={styles.swatchRow}>
      {COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          aria-label={color.label}
          aria-pressed={(style.color ?? "inherit") === color.value}
          title={color.label}
          disabled={running}
          className={color.swatch
            ? `${styles.colorSwatch} ${(style.color ?? "inherit") === color.value ? styles.colorSwatchOn : ""}`
            : `${styles.inherit} ${(style.color ?? "inherit") === "inherit" ? styles.inheritOn : ""}`}
          {...(color.swatch ? { style: { background: color.swatch } } : {})}
          onClick={() => set({ color: color.value })}
        >
          {color.swatch ? null : "지면"}
        </button>
      ))}
      <button
        type="button"
        aria-label="형광"
        aria-pressed={style.highlight === true}
        title="강조색을 옅게 깝니다"
        disabled={running}
        className={`${styles.toolButton} ${style.highlight ? styles.toolHighlight : ""}`}
        onClick={() => set({ highlight: !style.highlight })}
      >
        <span className={styles.toolSwatchAccent} />
      </button>
    </span>
  );

  if (compact) {
    return (
      <>
        {stepper}
        <span className={styles.toolRule} />
        {marks}
        <span className={styles.toolRule} />
        {swatches}
      </>
    );
  }

  return (
    <div className={styles.propRows}>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>크기</span>
        {stepper}
        <span className={styles.propNote}>지면 계단 {index + 1}/{SIZE_STEPS.length}</span>
      </div>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>굵기</span>
        <span className={styles.weightSegment}>
          {WEIGHTS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={running}
              aria-pressed={style.weight === option.value}
              className={`${styles.weightOption} ${style.weight === option.value ? styles.weightOptionActive : ""}`}
              onClick={() => set({ weight: option.value })}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>글자</span>
        <span className={styles.markRow}>{marks}</span>
      </div>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>색</span>
        {swatches}
      </div>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>정렬</span>
        <span className={styles.alignRow}>
          {ALIGNMENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={style.alignment === option.value}
              disabled={running}
              className={`${styles.alignButton} ${style.alignment === option.value ? styles.alignButtonOn : ""}`}
              onClick={() => set({ alignment: option.value })}
            >
              <Icon
                name={option.icon}
                size={14}
                color={style.alignment === option.value ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
              />
            </button>
          ))}
        </span>
      </div>
      <div className={styles.propRow}>
        <span className={styles.propLabel}>줄 간격</span>
        <span className={styles.weightSegment}>
          {SPACINGS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={running}
              aria-pressed={style.spacing === option.value}
              className={`${styles.weightOption} ${style.spacing === option.value ? styles.weightOptionActive : ""}`}
              onClick={() => set({ spacing: option.value })}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

export function PropertiesPanel({
  portfolioId,
  block,
  path,
  layoutStep,
}: {
  portfolioId: string;
  block: PortfolioBlock | null;
  path: string;
  layoutStep: (typeof SIZE_STEPS)[number];
}) {
  const [result, run, running] = useActionState<EditResult, FormData>(editBlockAction, {});

  if (!block) {
    return (
      <div className={styles.properties}>
        <p className={styles.panelEmpty}>
          왼쪽 지면에서 고칠 것을 하나 누르면 여기에 그 속성이 나옵니다.
        </p>
      </div>
    );
  }

  const fields = EDITABLE_FIELDS[block.kind];
  const style = block.style as Record<string, string | undefined>;

  return (
    <div className={styles.properties}>
      <div className={styles.targetCard}>
        <Icon name="crosshair-simple" size={15} color="#354DA8" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.targetName}>{BLOCK_KIND_LABEL[block.kind] ?? "블록"}</div>
          <div className={styles.targetPath}>{path}</div>
        </div>
        {block.locked ? <span className={styles.lockedTag}>직접 고침</span> : null}
      </div>

      {result.error ? <p className={styles.panelError}>{result.error}</p> : null}

      {fields === undefined ? (
        <p className={styles.panelEmpty}>
          이 블록은 값을 직접 고칠 수 없습니다. 지면에서 자리만 옮길 수 있습니다.
        </p>
      ) : (
        <div className={styles.propGroup}>
          <div className={styles.propGroupHead}>
            <span className={styles.propGroupLabel}>내용</span>
            <span className={styles.propGroupRule} />
          </div>
          <div className={styles.propRows}>
            {fields.map((field) => (
              <form key={field.path} action={run} className={styles.propForm}>
                <input type="hidden" name="portfolioId" value={portfolioId} />
                <input type="hidden" name="blockId" value={block.id} />
                <input type="hidden" name="path" value={field.path} />
                <span className={styles.propLabel}>{field.label}</span>
                {field.multiline ? (
                  <textarea
                    name="text"
                    className={styles.textArea}
                    defaultValue={fieldValue(block, field.path)}
                    aria-label={field.label}
                    rows={4}
                  />
                ) : (
                  <input
                    name="text"
                    className={styles.textInput}
                    defaultValue={fieldValue(block, field.path)}
                    aria-label={field.label}
                  />
                )}
                <button type="submit" className={styles.propSave} disabled={running}>
                  저장
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className={styles.propGroup}>
        <div className={styles.propGroupHead}>
          <span className={styles.propGroupLabel}>모양</span>
          <span className={styles.propGroupRule} />
          <span className={styles.propGroupNote}>지면의 계단과 팔레트 위에서</span>
        </div>
        <StyleControls
          portfolioId={portfolioId}
          block={block}
          layoutStep={layoutStep}
          run={run}
          running={running}
        />
      </div>
    </div>
  );
}

function fieldValue(block: PortfolioBlock, path: string): string {
  const value = block.content[path.slice("content.".length)];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

/** 이력을 날짜로 묶는 이름. 오늘 · 어제 · 그 밖은 월일. */
function dayLabel(at: string, today: Date): string {
  const day = new Date(at);
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(today) - start(day)) / 86_400_000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return day.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

const HISTORY_FILTERS: ReadonlyArray<{ key: PortfolioRevision["actor"] | null; label: string }> = [
  { key: null, label: "전체" },
  { key: "ai", label: "AI 편집" },
  { key: "user", label: "직접 편집" },
];

/** 04c 이력 탭 — AI가 고친 것과 내가 고친 것을 나눠서 되돌린다. */
export function HistoryPanel({
  portfolioId,
  displayName,
  revisions: initialRevisions,
  nextCursor: initialCursor = null,
  checkpoints,
}: {
  portfolioId: string;
  displayName: string;
  revisions: readonly PortfolioRevision[];
  nextCursor?: string | null;
  checkpoints: readonly EditorCheckpoint[];
}) {
  const [result, run, running] = useActionState<HistoryResult, FormData>(historyAction, {});
  /** 되물은 자리. 한 번 더 누르면 그때는 덮는다 — 상태를 따로 두지 않고 결과에서 읽는다. */
  const asked = result.conflict?.revisionId ?? null;
  const [filter, setFilter] = useState<PortfolioRevision["actor"] | null>(null);
  const [list, setList] = useState<{ revisions: readonly PortfolioRevision[]; nextCursor: string | null }>({
    revisions: initialRevisions,
    nextCursor: initialCursor,
  });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  /** 날짜 묶음과 「N분 전」의 기준 시각. 렌더마다 시계를 읽지 않는다. */
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  // 서버가 새 이력을 내려주면(되돌리기 · 편집 뒤) 첫 장을 다시 맞춘다.
  useEffect(() => {
    if (filter !== null) return;
    setList({ revisions: initialRevisions, nextCursor: initialCursor });
    setLoadedAt(Date.now());
  }, [initialRevisions, initialCursor, filter]);

  async function load(nextFilter: PortfolioRevision["actor"] | null, cursor: string | null) {
    setLoading(true);
    setLoadFailed(false);
    try {
      const page = await revisionsAction(portfolioId, nextFilter, cursor);
      setList((current) => ({
        revisions: cursor ? [...current.revisions, ...page.revisions] : page.revisions,
        nextCursor: page.nextCursor,
      }));
      setLoadedAt(Date.now());
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function chooseFilter(next: PortfolioRevision["actor"] | null) {
    if (next === filter) return;
    setFilter(next);
    void load(next, null);
  }

  function revert(revisionId: string, force: boolean) {
    const formData = new FormData();
    formData.set("portfolioId", portfolioId);
    formData.set("revisionId", revisionId);
    if (force) formData.set("force", "true");
    run(formData);
  }

  function restore(snapshotId: string) {
    const formData = new FormData();
    formData.set("portfolioId", portfolioId);
    formData.set("snapshotId", snapshotId);
    run(formData);
  }
  const relative = (at: string) => {
    const minutes = Math.max(0, Math.round((loadedAt - new Date(at).getTime()) / 60_000));
    if (minutes < 1) return "방금";
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.round(hours / 24)}일 전`;
  };

  /*
   * 서버의 `isCurrent`는 받은 목록의 첫 줄이다. 종류로 거른 목록에서는 그 줄이 최신이
   * 아닐 수 있어, 거르지 않은 첫 장의 첫 줄을 「지금 보는 상태」로 삼는다.
   */
  const latestId = initialRevisions[0]?.id ?? null;
  const today = new Date(loadedAt);
  const groups: { label: string; revisions: PortfolioRevision[] }[] = [];
  for (const revision of list.revisions) {
    const label = dayLabel(revision.createdAt, today);
    const last = groups.at(-1);
    if (last?.label === label) last.revisions.push(revision);
    else groups.push({ label, revisions: [revision] });
  }

  return (
    <div className={styles.history}>
      <div className={styles.historyFilters} role="group" aria-label="이력 종류">
        {HISTORY_FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={filter === item.key}
            disabled={loading}
            onClick={() => chooseFilter(item.key)}
            className={`${styles.historyFilter} ${filter === item.key ? styles.historyFilterActive : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {result.error ? <p className={styles.panelError}>{result.error}</p> : null}
      {result.conflict ? (
        <p className={styles.panelError}>
          그 뒤에 이 자리를 또 고쳤습니다. 되돌리면 그 편집이 사라집니다 — 한 번 더
          누르면 그때는 덮습니다.
        </p>
      ) : null}
      {loadFailed ? <p className={styles.panelError}>이력을 불러오지 못했습니다.</p> : null}

      {list.revisions.length === 0 && !loading ? (
        <div className={styles.revisionMeta}>
          {filter === "ai" ? "AI가 고친 이력이 없습니다" : filter === "user" ? "직접 고친 이력이 없습니다" : "아직 변경 이력이 없습니다"}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles.historyDay}>{group.label}</div>
          {group.revisions.map((revision) => (
            <div key={revision.id} className={styles.revision}>
              {revision.actor === "ai" ? (
                <span className={styles.revisionAi} aria-label="AI 편집">
                  <Icon name="coffee" weight="fill" size={11} color="var(--ex-accent-surface)" />
                </span>
              ) : (
                <span className={styles.revisionUser} aria-label={`${displayName} 직접 편집`}>
                  {displayName.slice(0, 1)}
                </span>
              )}
              <div className={styles.revisionBody}>
                <div className={styles.revisionSummary}>{revision.summary}</div>
                <div className={styles.revisionMeta}>
                  {relative(revision.createdAt)}
                  {revision.id === latestId ? " · 지금 보는 상태" : ""}
                </div>
              </div>
              {/* 최신 항목은 되돌리기 버튼을 숨긴다. 섹션 변경은 블록이 없어 복원으로만 되돌린다. */}
              {revision.id === latestId || revision.blockId === null ? null : (
                <button
                  type="button"
                  className={styles.revisionRevert}
                  disabled={running}
                  onClick={() => {
                    if (asked === revision.id) revert(revision.id, true);
                    else revert(revision.id, false);
                  }}
                >
                  {asked === revision.id ? "그래도 되돌리기" : "되돌리기"}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {list.nextCursor ? (
        <button
          type="button"
          className={styles.historyMore}
          disabled={loading}
          onClick={() => void load(filter, list.nextCursor)}
        >
          {loading ? "불러오는 중…" : "이전 이력 더 보기"}
        </button>
      ) : null}

      <div className={styles.checkpointHead}>되돌릴 수 있는 지점</div>
      {checkpoints.map((checkpoint) => (
        <div key={checkpoint.id} className={styles.checkpoint}>
          <Icon name="flag" size={13} color="var(--ex-fg-muted)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.checkpointName}>{checkpoint.label}</div>
            <div className={styles.checkpointAt}>
              {new Date(checkpoint.createdAt).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <button
            type="button"
            className={styles.checkpointRestore}
            disabled={running}
            onClick={() => restore(checkpoint.id)}
          >
            복원
          </button>
        </div>
      ))}

      {/* P3 잠금 규칙 */}
      <div className={styles.lockNote}>
        <Icon name="info" size={13} color="var(--ex-accent-text)" />
        <span className={styles.lockNoteText}>
          직접 고친 부분은 AI가 다시 쓸 때 그대로 둡니다.
        </span>
      </div>
    </div>
  );
}
