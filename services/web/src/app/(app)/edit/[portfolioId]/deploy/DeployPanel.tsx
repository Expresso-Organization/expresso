"use client";

import type { DeploymentSummary, PortfolioDetail } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";

import { Icon } from "@/components/ui/Icon";

import { deployAction, type DeployResult } from "./deploy-actions";
import styles from "./page.module.css";

/**
 * 08b 배포 · 버전.
 *
 * 배포는 **버전을 하나 더 만드는 일**이다. 덮어쓰지 않으므로 되돌릴 곳이 남고,
 * 주소를 바꿔도 옛 주소가 30일간 새 주소로 넘어간다.
 *
 * 주소와 공개 설정은 배포와 함께 나간다 — 이미 나간 버전의 설정은 고칠 수 없다.
 * 나간 것은 그때의 사본이고, 사본을 나중에 손대면 그건 사본이 아니다.
 */

const CONTACT_LABEL = {
  public: "누구에게나",
  on_request: "요청한 사람에게만",
  hidden: "공개하지 않음",
} as const;

interface Check {
  ok: boolean;
  title: string;
  note: string;
  fix?: Route;
}

export function DeployPanel({
  portfolio,
  deployments,
  checks,
  canExport,
}: {
  portfolio: PortfolioDetail;
  deployments: DeploymentSummary[];
  checks: Check[];
  canExport: boolean;
}) {
  const [result, run, running] = useActionState<DeployResult, FormData>(deployAction, {});

  const live = portfolio.deployment;
  // 조사를 붙이지 않는다 — v1은 "이", v2는 "가"라 버전마다 틀린 말이 나온다.
  const said = result.published
    ? `배포했습니다 — v${result.published.version} · ${result.published.slug}.xpresso.me`
    : result.rolledBackTo
      ? `되돌렸습니다 — 지금 v${result.rolledBackTo} 사본이 공개 중입니다.`
      : result.unpublished
        ? "공개를 중단했습니다. 주소만 닫혔고 문서와 기록은 그대로입니다."
        : result.exportQueued
          ? `${result.exportQueued === "pdf" ? "PDF" : "덱"}을 만들고 있습니다. 다 되면 알려 드립니다.`
          : null;

  return (
    <>
      {result.error ? (
        <div className={`${styles.notice} ${styles.noticeBad}`}>
          <Icon name="warning-circle" weight="fill" size={14} />
          {result.error}
        </div>
      ) : said ? (
        <div className={styles.notice}>
          <Icon name="check-circle" weight="fill" size={14} color="var(--ex-espresso)" />
          {said}
        </div>
      ) : null}

      {/* 주소와 공개 설정 — 다음 배포에 함께 실린다 */}
      <form action={run} id="publish">
        <input type="hidden" name="intent" value="publish" />
        <input type="hidden" name="portfolioId" value={portfolio.id} />

        <div className={styles.section}>
          <div className={styles.sectionLabel}>ADDRESS</div>
          <div className={styles.card}>
            <div className={styles.slugRow}>
              <input
                className={styles.slugInput}
                name="slug"
                defaultValue={live?.subdomain ?? ""}
                placeholder="주소를 정하세요"
                aria-label="주소"
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                minLength={3}
                maxLength={63}
                required
              />
              <span className={styles.slugSuffix}>.xpresso.me</span>
              <span className={styles.slugState}>
                <Icon
                  name={live ? "check-circle" : "circle-dashed"}
                  weight="fill"
                  size={13}
                  color={live ? "var(--ex-success)" : "var(--ex-slate-400)"}
                />
                {live ? "사용 중" : "아직 없음"}
              </span>
              {live ? (
                <Link
                  href={`/site/${live.subdomain}` as Route}
                  className={styles.slugAction}
                  target="_blank"
                >
                  열어 보기
                </Link>
              ) : null}
            </div>
            <div className={styles.customDomain}>
              <span className={styles.customLabel}>커스텀 도메인</span>
              <span className={styles.customHost}>{live?.customDomain ?? "연결하지 않음"}</span>
              <span className={styles.customState}>팀 요금제</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>PRE-FLIGHT</div>
          <div className={styles.card}>
            {checks.map((check) => (
              <div key={check.title} className={styles.checkRow}>
                <Icon
                  name={check.ok ? "check-circle" : "warning-circle"}
                  weight="fill"
                  size={16}
                  color={check.ok ? "var(--ex-success)" : "var(--ex-danger)"}
                  style={{ flexShrink: 0, marginTop: "1px" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div className={styles.checkTitle}>{check.title}</div>
                  <div className={styles.checkNote}>{check.note}</div>
                </div>
                {check.fix ? (
                  <Link href={check.fix} className={styles.checkAction}>
                    고치기
                  </Link>
                ) : null}
              </div>
            ))}

            <div className={styles.optionRow}>
              <span className={styles.optionLabel}>검색 엔진 노출</span>
              <label className={styles.toggleWrap}>
                <input
                  type="checkbox"
                  name="indexable"
                  className={styles.toggleBox}
                  defaultChecked={live?.seoIndexable ?? false}
                  aria-label="검색 엔진 노출"
                />
                <span className={styles.toggle}>
                  <span className={styles.toggleKnob} />
                </span>
              </label>
            </div>
            <div className={styles.optionRow}>
              <span className={styles.optionLabel}>연락처 공개 범위</span>
              <select
                name="contactVisibility"
                className={`${styles.select} ${styles.selectNative}`}
                defaultValue={live?.contactVisibility ?? "hidden"}
                aria-label="연락처 공개 범위"
              >
                {(["public", "on_request", "hidden"] as const).map((value) => (
                  <option key={value} value={value}>
                    {CONTACT_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </form>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>VERSIONS</div>
        <div className={styles.card}>
          {deployments.length === 0 ? (
            <div className={styles.versionAt}>아직 배포한 적이 없습니다.</div>
          ) : (
            deployments.map((deployment) => (
              <div key={deployment.id} className={styles.versionRow}>
                <span className={styles.versionName}>v{deployment.version}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.versionSummary}>
                    {deployment.slug}.xpresso.me
                    <span className={styles.versionCount}>
                      {" "}
                      · 섹션 {deployment.sectionCount} · 블록 {deployment.blockCount}
                    </span>
                  </div>
                  <div className={styles.versionAt}>
                    {formatWhen(deployment.publishedAt)}
                    {deployment.seoIndexable ? " · 검색 노출" : " · 검색 비노출"}
                    {` · 연락처 ${CONTACT_LABEL[deployment.contactVisibility]}`}
                  </div>
                </div>
                {deployment.isCurrent ? (
                  <span className={styles.versionCurrent}>
                    {portfolio.status === "published" ? "공개 중" : "공개 중단됨"}
                  </span>
                ) : (
                  <form action={run}>
                    <input type="hidden" name="intent" value="rollback" />
                    <input type="hidden" name="portfolioId" value={portfolio.id} />
                    <input type="hidden" name="deploymentId" value={deployment.id} />
                    <button type="submit" className={styles.versionRevert}>
                      되돌리기
                    </button>
                  </form>
                )}
              </div>
            ))
          )}

          {live && portfolio.status === "published" ? (
            <form action={run} className={styles.dangerRow}>
              <input type="hidden" name="intent" value="unpublish" />
              <input type="hidden" name="portfolioId" value={portfolio.id} />
              <span className={styles.checkNote} style={{ flex: 1 }}>
                공개를 중단하면 주소가 닫힙니다. 문서와 기록은 지워지지 않습니다.
              </span>
              <button type="submit" className={styles.dangerAction}>
                공개 중단
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>EXPORT</div>
        <div className={styles.exportGrid}>
          {([
            { kind: "pdf", icon: "file-pdf", title: "PDF로 내보내기", note: "A4 · 인쇄 여백 적용" },
            { kind: "deck", icon: "presentation", title: "덱으로 내보내기", note: "섹션 하나가 한 장" },
          ] as const).map((item) => (
            <form key={item.kind} action={run}>
              <input type="hidden" name="intent" value="export" />
              <input type="hidden" name="portfolioId" value={portfolio.id} />
              <input type="hidden" name="kind" value={item.kind} />
              <button type="submit" className={styles.exportCard} disabled={!canExport}>
                <Icon name={item.icon} size={18} color="var(--ex-slate-500)" />
                <span className={styles.exportTitle}>{item.title}</span>
                <span className={styles.exportNote}>
                  {canExport ? item.note : "PRO에서 내보낼 수 있습니다"}
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* 헤더의 배포 단추가 이 폼을 쏜다 */}
      <button type="submit" form="publish" hidden aria-hidden="true" disabled={running} />
    </>
  );
}

/** 언제 나갔나. 오래된 것은 날짜로 적는다. */
function formatWhen(at: string): string {
  const published = new Date(at);
  const days = Math.floor((Date.now() - published.getTime()) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 14) return `${days}일 전`;
  return published.toISOString().slice(0, 10).replaceAll("-", ".");
}
