import type { Recipe } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { brews, recipes } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Waiting } from "../Waiting";
import { createRecipeAction } from "../brew-actions";
import styles from "./page.module.css";

/**
 * 02b 레시피.
 *
 * 레시피는 **계획**이지 글이 아니다(§8.3). 그래서 이 화면이 보여주는 것은
 * 문장이 아니라 "무엇을 어디에 담을지"다 — 섹션 구성, 섹션마다의 목적과 톤,
 * 어떤 근거를 어디에 놓았는지, 그리고 **무엇을 안 썼는지와 그 이유**.
 */

const ORIGIN_LABEL = { ai: "AI 초안", user: "내가 고침" } as const;
const ORIGIN_CLASS = { ai: styles.originAi, user: styles.originUser } as const;

const SOURCE_ICON = {
  record: "file-text",
  requirement: "target",
  answer: "chat-circle-dots",
} as const;

const SOURCE_LABEL = {
  record: "기록",
  requirement: "공고",
  answer: "대화",
} as const;

const FORMAT_LABEL: Record<string, string> = {
  narrative: "서사",
  bullets: "나열",
  metrics: "수치 중심",
  timeline: "시간순",
};

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

/** 섹션 하나가 어떤 갈래의 근거를 썼는지. 머리말의 칩이 된다. */
function refsOf(section: Recipe["sections"][number]) {
  const kinds = new Set(
    section.items.flatMap(({ evidence }) => evidence.map(({ sourceType }) => sourceType)),
  );
  return [...kinds].map((kind) => ({ icon: SOURCE_ICON[kind], label: SOURCE_LABEL[kind] }));
}

export default async function OutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { brewId } = await params;
  const { section: sectionParam } = await searchParams;
  const session = await requireSession();

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const drafting = brew.latestJob?.type === "recipe" && brew.latestJob.status !== "succeeded";
  const portfolioTitle = brew.freeTitle ?? brew.posting?.title ?? null;
  const isFreeBrew = brew.freeTitle !== null;
  if (!brew.recipeId || drafting) {
    return (
      <BrewFrame brewId={brewId} step="outline" portfolioTitle={portfolioTitle}
        situation={brew.recipeId ? "다시 짜는 중" : "아직 없음"} tinted>
        <Waiting
          title="레시피"
          note={isFreeBrew
            ? "적어 둔 내용으로 첫 구성을 만듭니다. 구성과 문장은 다음 단계에서 직접 고칠 수 있습니다."
            : `고른 재료 ${brew.materials.selected}건으로 무엇을 어디에 담을지 정합니다.`}
          job={brew.latestJob?.type === "recipe" ? brew.latestJob : null}
          action={createRecipeAction}
          actionLabel="레시피 만들기"
          rejectedNote={isFreeBrew
            ? "입력한 내용을 읽지 못했습니다. 자유 생성 설명을 보완한 뒤 다시 시도해 주세요."
            : "재료가 세 건보다 적습니다. 기록을 더 고른 뒤 다시 시도해 주세요."}
          brewId={brewId}
        />
      </BrewFrame>
    );
  }

  const recipe = (await recipes.get(session.accessToken, brew.recipeId)).data;
  const active = recipe.sections.find(({ id }) => id === sectionParam) ?? recipe.sections[0]!;
  const totalItems = recipe.sections.reduce((sum, { items }) => sum + items.length, 0);
  const editedCount = recipe.sections.filter(({ editedBy }) => editedBy === "user").length;
  const placed = new Set(recipe.evidencePaths.map(({ sourceId }) => sourceId)).size;
  const plan = recipe.portfolioPlan;

  return (
    <BrewFrame
      brewId={brewId}
      step="outline"
      portfolioTitle={portfolioTitle}
      situation={`섹션 ${recipe.sections.length}개 · v${recipe.version}`}
      tinted
    >
      <div className={styles.body}>
        <div className={styles.topBar}>
          <Icon name="list-checks" weight="fill" size={15} color="var(--ex-espresso)" />
          <span className={styles.topTitle}>
            {plan ? "포트폴리오 설계안 v1" : "컨텍스트 문서"} · 섹션 {recipe.sections.length}개
          </span>
          <span className={styles.topRule} />
          <span className={styles.topLabel}>읽은 것</span>
          <span className={styles.readChip}>
            <Icon name="file-text" size={10} color="var(--ex-espresso)" />
            고른 기록 {brew.materials.selected}건
          </span>
          <span className={styles.readChip}>
            <Icon name="link-simple" size={10} color="var(--ex-espresso)" />
            근거 {recipe.evidencePaths.length}개
          </span>
          <div className={styles.topRight}>
            <form action={createRecipeAction}>
              <input type="hidden" name="brewId" value={brewId} />
              <button type="submit" className={styles.outlineButton}>
                <Icon name="arrow-counter-clockwise" size={12} />
                구성 다시 만들기
              </button>
            </form>
          </div>
        </div>

        <div className={styles.columns}>
          <aside className={`${styles.panel} ${styles.sections}`} aria-label="구성">
            <div className={styles.sectionsHead}>
              <span className={styles.sectionsTitle}>구성</span>
              <span className={styles.sectionsNote}>지면 순서</span>
              <span className={styles.sectionsCount}>{recipe.sections.length}</span>
            </div>
            <div className={styles.sectionsList}>
              {recipe.sections.map((item) => (
                <Link
                  key={item.id}
                  href={`/brew/${brewId}/outline?section=${item.id}` as Route}
                  aria-current={item.id === active.id ? "true" : undefined}
                  className={`${styles.sectionRow} ${
                    item.id === active.id ? styles.sectionRowActive : ""
                  }`}
                >
                  <span className={styles.sectionNo}>{no(item.order)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className={styles.sectionTitle} style={{ display: "block" }}>
                      {item.title}
                    </span>
                    <span className={styles.sectionOrigin}>
                      <span className={`${styles.originDot} ${ORIGIN_CLASS[item.editedBy]}`} />
                      <span className={styles.originLabel}>{ORIGIN_LABEL[item.editedBy]}</span>
                      <span className={styles.originLabel}>· {item.targetLength}자</span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className={styles.sectionsFoot}>
              <div className={styles.dragHint}>
                합쳐서 {recipe.sections.reduce((sum, { targetLength }) => sum + targetLength, 0)}자
              </div>
            </div>
          </aside>

          <section className={`${styles.panel} ${styles.document}`} aria-label="컨텍스트 문서">
            <div className={styles.documentHead}>
              <div className={styles.documentTitleRow}>
                <Icon name="file-text" size={15} color="var(--ex-espresso)" />
                <span className={styles.documentTitle}>{active.title}</span>
              </div>
              <div className={styles.documentSub}>
                <span className={styles.topLabel}>컨텍스트</span>
                <span className={styles.documentSubText}>
                  무엇을 담을지 적어두는 문서 · 문장은 아직 쓰지 않습니다
                </span>
                <span className={styles.documentRefs}>
                  {refsOf(active).map((ref) => (
                    <span key={ref.label} className={styles.readChip}>
                      <Icon name={ref.icon} size={10} color="var(--ex-espresso)" />
                      {ref.label}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            <div className={styles.documentBody}>
              {plan && active.order === 0 ? (
                <ContextBlock label="포지셔닝" editedBy={active.editedBy}>
                  <div className={styles.contextText}>{plan.positioning.headlineIntent}</div>
                  <div className={styles.contextHint}>{plan.positioning.valueProposition}</div>
                </ContextBlock>
              ) : null}

              <ContextBlock label="목적" editedBy={active.editedBy}>
                <div className={styles.contextText}>{active.purpose}</div>
              </ContextBlock>

              <ContextBlock label="왜 두는가" editedBy={active.editedBy}>
                <div className={styles.contextText}>{active.context.goal}</div>
              </ContextBlock>

              <ContextBlock label="읽고 남길 것" editedBy={active.editedBy}>
                <div className={styles.contextText}>{active.context.takeaway}</div>
              </ContextBlock>

              <ContextBlock label="담을 것" editedBy={active.editedBy}>
                {active.items.map((item) => (
                  <div key={item.id} className={styles.point}>
                    <Icon
                      name="dots-six-vertical"
                      size={12}
                      color="var(--ex-border-quiet)"
                      style={{ flexShrink: 0, marginTop: "3px" }}
                    />
                    <span className={styles.pointText}>{item.pointText}</span>
                    <span className={styles.pointSource}>
                      {item.evidence.map((path) => (
                        <span key={path.id} className={styles.sourceChip}>
                          <Icon
                            name={SOURCE_ICON[path.sourceType]}
                            size={9.5}
                            color="var(--ex-espresso)"
                          />
                          {path.sourceLabel.slice(0, 24)}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </ContextBlock>

              {active.context.metrics.length > 0 ? (
                <ContextBlock label="살릴 수치" editedBy={active.editedBy}>
                  <div className={styles.chipRow}>
                    {active.context.metrics.map((metric) => (
                      <span key={metric} className={styles.valueChip}>{metric}</span>
                    ))}
                  </div>
                </ContextBlock>
              ) : null}

              <ContextBlock label="톤 · 형식" editedBy={active.editedBy}>
                <div className={styles.chipRow}>
                  <span className={styles.valueChip}>{active.context.tone}</span>
                  <span className={styles.valueChip}>
                    {FORMAT_LABEL[active.context.format] ?? active.context.format}
                  </span>
                  <span className={styles.valueChip}>{active.context.contentPattern}</span>
                </div>
              </ContextBlock>

              {active.context.interactionOpportunity ? (
                <ContextBlock label="인터랙션 기회" editedBy={active.editedBy}>
                  <div className={styles.contextText}>
                    {active.context.interactionOpportunity}
                  </div>
                </ContextBlock>
              ) : null}

              {active.context.exclude.length > 0 ? (
                <ContextBlock label="쓰지 않을 것" editedBy={active.editedBy}>
                  <div className={styles.chipRow}>
                    {active.context.exclude.map((term) => (
                      <span key={term} className={styles.valueChip}>{term}</span>
                    ))}
                  </div>
                </ContextBlock>
              ) : null}

              <div className={styles.brewNotice}>
                <Icon name="coffee" weight="fill" size={13} color="var(--ex-espresso)" />
                <span className={styles.brewNoticeText}>
                  다음 단계에서 이 컨텍스트대로 문장이 만들어집니다
                </span>
              </div>
            </div>

            <div className={styles.documentFoot}>
              <span className={styles.footMeta}>
                항목 {active.items.length}개 · 목표 {active.targetLength}자
              </span>
            </div>
          </section>

          <aside className={`${styles.panel} ${styles.rationale}`} aria-label="근거">
            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>문서 · 내가 고침</span>
                <span className={styles.summaryValue}>
                  {recipe.sections.length} · {editedCount}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>배치된 재료</span>
                <span className={styles.summaryValue}>
                  {placed} / {brew.materials.selected}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>담을 항목</span>
                <span className={styles.summaryValue}>{totalItems}</span>
              </div>
            </div>

            <div className={styles.rationaleBody}>
              <div className={styles.rationaleHead}>
                <span className={styles.rationaleTitle}>왜 이 구성인가</span>
              </div>
              <div className={styles.rationaleList}>
                {plan ? <div className={styles.planRationale}>{plan.rationale}</div> : null}
                {recipe.sections.map((item) => (
                  <div key={item.id} className={styles.rationaleRow}>
                    <span className={styles.rationaleDot} />
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.rationaleText}>{item.context.goal}</div>
                      <div className={styles.rationalePath}>
                        {no(item.order)} {item.title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {plan && plan.requirementCoverage.length > 0 ? (
                <>
                  <div className={styles.rationaleDivider} />
                  <div className={styles.rationaleHead}>
                    <span className={styles.rationaleTitle}>공고 요구사항 연결</span>
                    <span className={styles.sectionsCount} style={{ marginLeft: 0 }}>
                      {plan.requirementCoverage.filter(({ coverage }) => coverage === "covered").length}
                      /{plan.requirementCoverage.length}
                    </span>
                  </div>
                  {plan.requirementCoverage.map((coverage) => (
                    <div key={coverage.requirementId} className={styles.coverageRow}>
                      <span
                        className={`${styles.coverageState} ${
                          styles[`coverage_${coverage.coverage}`]
                        }`}
                      >
                        {coverage.coverage}
                      </span>
                      <div>
                        <div className={styles.rationaleText}>{coverage.requirementLabel}</div>
                        <div className={styles.rationalePath}>{coverage.reason}</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {recipe.unusedSources.length > 0 ? (
                <>
                  <div className={styles.rationaleDivider} />
                  <div className={styles.rationaleHead}>
                    <span className={styles.rationaleTitle}>쓰이지 않은 재료</span>
                    <span className={styles.sectionsCount} style={{ marginLeft: 0 }}>
                      {recipe.unusedSources.length}
                    </span>
                  </div>
                  {recipe.unusedSources.map((unused) => (
                    <div key={unused.recordId} className={styles.unusedCard}>
                      <Icon name="file-text" size={13} color="var(--ex-slate-500)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.unusedReason}>{unused.reason}</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>

            <div className={styles.rationaleFoot}>
              <div className={styles.rationaleFootNote}>
                다음 단계에서는 이 컨텍스트에 맞는 디자인만 보여드립니다.
              </div>
              <Link href={`/brew/${brewId}/design` as Route} className={styles.brew}>
                이 레시피로 디자인 고르기
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </BrewFrame>
  );
}

/** 컨텍스트 한 칸. 누가 썼는지가 왼쪽에 붙는다. */
function ContextBlock({
  label,
  editedBy,
  children,
}: {
  label: string;
  editedBy: "ai" | "user";
  children: React.ReactNode;
}) {
  return (
    <div className={styles.contextBlock}>
      <div className={styles.contextLabel}>
        <div className={styles.contextKey}>{label}</div>
        <div className={styles.contextAuthor}>
          <span className={`${styles.originDot} ${ORIGIN_CLASS[editedBy]}`} />
          <span className={styles.authorName}>{editedBy === "ai" ? "AI" : "나"}</span>
        </div>
      </div>
      <div
        className={`${styles.contextValue} ${
          editedBy === "ai" ? styles.contextValueAi : styles.contextValueUser
        }`}
      >
        {children}
      </div>
    </div>
  );
}
