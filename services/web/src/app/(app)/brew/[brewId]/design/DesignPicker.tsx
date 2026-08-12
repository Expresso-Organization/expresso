"use client";

import type { EntitlementUsage, PlanCode, TemplatePreview } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { startGenerationAction, type BrewState } from "./design-actions";
import styles from "./page.module.css";
import { TemplateThumb } from "./TemplateThumb";

/**
 * 03 디자인 후보.
 *
 * 걷어낸 것과 왜:
 *
 * - **직군 필터**(전체 12 · 개발·데이터 · …) — 템플릿에 직군 열이 없다.
 *   `industries`가 있지만 세 종에 붙은 값으로 거를 만큼 촘촘하지 않다.
 *   대신 추천이 왜 추천인지를 한 줄로 적는다.
 * - **Style Remix** — 지면을 비트는 계약(`POST /portfolios/:id/layouts/remix`)은
 *   **포트폴리오가 있어야** 돈다. 추출 전에는 비틀 대상이 없다. 04에 있어야 할
 *   기능이라 여기서는 뺐다.
 * - **얼마나 진하게(분량)** — 레시피가 이미 그 분량으로 짜였다. 여기서 바꿔도
 *   반영되는 곳이 없다. 새 제작 화면으로 옮겼다.
 * - **팔레트·타이포·밀도 요약의 고정값** — "Pretendard · 본문 16" · "당근 CI
 *   반영"은 화면에 적혀 있던 글자였다. 이제 고른 템플릿의 실제 style에서 온다.
 */
export function DesignPicker({
  brewId,
  recipeId,
  previews,
  planCode,
  usage,
  allowed,
  companyName,
  useCompanyColors,
  madePortfolioId,
  failureCode,
}: {
  brewId: string;
  recipeId: string;
  previews: TemplatePreview[];
  planCode: PlanCode;
  usage: EntitlementUsage | null;
  allowed: boolean;
  companyName: string | null;
  useCompanyColors: boolean;
  madePortfolioId: string | null;
  failureCode: string | null;
}) {
  const [state, submit, pending] = useActionState<BrewState, FormData>(
    startGenerationAction,
    { error: null },
  );
  const usable = previews.filter(
    (preview) => preview.planRequired === "free" || planCode !== "free",
  );
  const [templateId, setTemplateId] = useState<string>(
    usable[0]?.templateId ?? previews[0]?.templateId ?? "",
  );
  const chosen = previews.find((preview) => preview.templateId === templateId);
  const initialStyle = usable[0]?.style ?? previews[0]?.style;
  const [structure, setStructure] = useState(initialStyle?.structure ?? "single-column");
  const [density, setDensity] = useState(initialStyle?.density ?? "comfortable");
  const [font, setFont] = useState(initialStyle?.font ?? "sans");
  const locked = chosen?.planRequired === "pro" && planCode === "free";

  return (
    <div className={styles.body}>
      <div className={styles.left}>
        <div className={`${styles.card} ${styles.pickerCard}`}>
          <div className={styles.pickerHead}>
            <span className={styles.pickerTitle}>디자인을 고르세요</span>
            <span className={styles.pickerNote}>04에서 언제든 바꿀 수 있습니다</span>
            {companyName ? (
              <div className={styles.toneRow}>
                <span className={styles.toneLabel}>{companyName} 색 쓰기</span>
                {/* 서버가 다시 렌더해야 색이 바뀐다 — 색은 미리보기에 구워 나온다. */}
                <Link
                  href={
                    (useCompanyColors
                      ? `/brew/${brewId}/design`
                      : `/brew/${brewId}/design?tone=1`) as Route
                  }
                  role="switch"
                  aria-checked={useCompanyColors}
                  aria-label={`${companyName} 색 쓰기`}
                  className={`${styles.toneToggle} ${useCompanyColors ? styles.toneToggleOn : ""}`}
                >
                  <span className={styles.toneKnob} />
                </Link>
              </div>
            ) : null}
          </div>

          <div className={styles.recipeBar}>
            <Icon name="list-checks" weight="fill" size={14} color="var(--ex-espresso)" />
            <span className={styles.recipeBarText}>
              레시피 {previews[0]?.sections.length ?? 0}개 섹션을 그대로 채워 보여줍니다
            </span>
            <span className={styles.recipeBarSections}>
              {(previews[0]?.sections ?? []).map((section) => section.title).join(" · ")}
            </span>
            <Link href={`/brew/${brewId}/outline` as Route} className={styles.recipeBarAction}>
              레시피 보기
            </Link>
          </div>

          <div className={styles.templates}>
            {previews.map((preview) => {
              const selected = preview.templateId === templateId;
              return (
                <button
                  key={preview.templateId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setTemplateId(preview.templateId);
                    setStructure(preview.style.structure);
                    setDensity(preview.style.density);
                    setFont(preview.style.font);
                  }}
                  className={`${styles.template} ${selected ? styles.templateSelected : ""}`}
                >
                  <span className={styles.templateCanvas}>
                    <TemplateThumb preview={preview} />
                    {selected ? (
                      <span className={styles.templateCheck}>
                        <Icon name="check" size={11} color="var(--ex-white)" />
                      </span>
                    ) : preview.recommended ? (
                      <span className={styles.toneBadge}>
                        <Icon name="sparkle" weight="fill" size={9} color="var(--ex-white)" />
                        <span className={styles.toneBadgeText}>추천</span>
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.templateFoot}>
                    <span className={styles.templateNameRow}>
                      <span className={styles.templateName}>{preview.name}</span>
                      <span
                        className={
                          preview.planRequired === "pro" ? styles.planPro : styles.planFree
                        }
                      >
                        {preview.planRequired.toUpperCase()}
                      </span>
                    </span>
                    <span className={styles.templateDesc}>{preview.recommendationReason}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <aside className={styles.right}>
        {chosen ? (
          <div className={`${styles.card} ${styles.chosenCard}`}>
            <div className={styles.chosenHead}>
              <span className={styles.chosenName}>{chosen.name}</span>
              <span
                className={chosen.planRequired === "pro" ? styles.planPro : styles.planFree}
                style={{ marginLeft: 0 }}
              >
                {chosen.planRequired.toUpperCase()}
              </span>
            </div>
            <div className={styles.chosenList}>
              <div className={styles.chosenRow}>
                <span className={styles.chosenLabel}>팔레트</span>
                <span className={styles.palette}>
                  <span className={styles.swatch} style={{ background: chosen.style.accent }} />
                  <span className={styles.swatch} style={{ background: chosen.style.text }} />
                  <span
                    className={styles.swatch}
                    style={{ background: chosen.style.background }}
                  />
                </span>
                {/* 대비가 모자라면 글자색을 우리가 바꾼다. 바꿨으면 그렇다고 말한다. */}
                {chosen.colorAdjusted ? (
                  <span className={styles.ciNote}>대비를 위해 글자색 조정</span>
                ) : null}
              </div>
              <div className={styles.chosenRow}>
                <span className={styles.chosenLabel}>서체</span>
                <select
                  className={styles.styleSelect}
                  value={font}
                  onChange={(event) => setFont(event.target.value as "sans" | "serif")}
                >
                  <option value="sans">고딕 계열</option>
                  <option value="serif">명조 계열</option>
                </select>
              </div>
              <div className={styles.chosenRow}>
                <span className={styles.chosenLabel}>밀도</span>
                <select
                  className={styles.styleSelect}
                  value={density}
                  onChange={(event) => setDensity(
                    event.target.value as "compact" | "comfortable" | "spacious",
                  )}
                >
                  <option value="compact">좁게</option>
                  <option value="comfortable">보통</option>
                  <option value="spacious">넓게</option>
                </select>
              </div>
              <div className={styles.chosenRow}>
                <span className={styles.chosenLabel}>구성 문법</span>
                <select
                  className={styles.styleSelect}
                  value={structure}
                  onChange={(event) => setStructure(
                    event.target.value as "single-column" | "dense-grid" | "wide-margin",
                  )}
                >
                  <option value="single-column">단일 서사</option>
                  <option value="dense-grid">근거 격자</option>
                  <option value="wide-margin">에디토리얼 여백</option>
                </select>
              </div>
              <div className={styles.chosenRow}>
                <span className={styles.chosenLabel}>글자 대비</span>
                <span className={styles.chosenValue}>{chosen.contrastRatio.toFixed(1)} : 1</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`${styles.card} ${styles.actionCard}`}>
          {madePortfolioId ? (
            <div className={styles.madeRow}>
              <Icon name="info" size={14} color="var(--ex-slate-500)" />
              <span className={styles.madeText}>이 제작으로 이미 한 번 뽑았습니다.</span>
              <Link href={`/edit/${madePortfolioId}` as Route} className={styles.madeLink}>
                열기
              </Link>
            </div>
          ) : null}

          {failureCode ? (
            <p className={styles.failure}>
              지난번 추출이 끝나지 못했습니다({failureCode}). 다시 눌러 보세요.
            </p>
          ) : null}

          <form action={submit} className={styles.brewWrap}>
            <input type="hidden" name="brewId" value={brewId} />
            <input type="hidden" name="recipeId" value={recipeId} />
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="structure" value={structure} />
            <input type="hidden" name="density" value={density} />
            <input type="hidden" name="font" value={font} />
            <button
              type="submit"
              className={styles.brew}
              disabled={pending || locked || !allowed}
            >
              <Icon name="coffee" weight="fill" size={16} />
              {pending ? "추출을 맡기는 중" : "추출하기"}
            </button>
            <div className={styles.brewNote}>
              {/* 실측 3분이다. 정의서의 90초는 재기 전 추정치였다. */}
              약 3분 걸립니다
              {usage ? ` · 이번 달 ${usage.used} / ${usage.limit ?? "무제한"}` : ""}
            </div>
          </form>

          {locked ? (
            <p className={styles.gateNoteSmall}>
              {chosen?.name}은 PRO 디자인입니다. FREE 디자인을 고르거나 요금제를 올려 주세요.
            </p>
          ) : null}
          {!allowed && !locked ? (
            <p className={styles.gateNoteSmall}>
              이번 달 추출 횟수를 다 썼습니다. 다음 달에 다시 뽑을 수 있습니다.
            </p>
          ) : null}
          {state.error ? <p className={styles.failure}>{state.error}</p> : null}
        </div>
      </aside>
    </div>
  );
}
