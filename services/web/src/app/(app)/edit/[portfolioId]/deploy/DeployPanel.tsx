"use client";

import type { DeploymentSummary, PortfolioDetail } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { PUBLIC_SITE_HOST, publicSiteHost, publicSiteUrl } from "@/lib/public-site";
import { publishState, type PublishState } from "@/lib/publish-state";

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
 *
 * 헤더의 배포 단추와 본문이 같은 진행 상태를 봐야 하므로 헤더까지 이 부품이 그린다.
 * 방문자가 보는 것을 바로 바꾸는 일(공개 중단 · 되돌리기)은 확인 창을 거친다.
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

type Intent = "publish" | "rollback" | "unpublish" | "reopen";

/** 확인 창에 올린 일. 창이 닫히는 동안에도 글이 남도록 열림과 따로 둔다. */
type Confirm = { kind: "unpublish" } | { kind: "rollback"; deployment: DeploymentSummary };

export function DeployPanel({
  portfolio,
  deployments,
  checks,
  nextVersion,
  canPublish,
}: {
  portfolio: PortfolioDetail;
  deployments: DeploymentSummary[];
  checks: Check[];
  nextVersion: number;
  /** 배포할 지면 판이 있는가. 없으면 배포 단추를 누를 수 없다. */
  canPublish: boolean;
}) {
  const [result, run, running] = useActionState<DeployResult, FormData>(deployAction, {});
  const [doing, setDoing] = useState<Intent | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const state = publishState(portfolio);
  const live = portfolio.deployment;
  const current = deployments.find((deployment) => deployment.isCurrent) ?? null;
  const editor = `/edit/${portfolio.id}` as Route;
  const publishing = running && doing === "publish";

  const send = (intent: Exclude<Intent, "publish">, fields: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("intent", intent);
    data.set("portfolioId", portfolio.id);
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    setDoing(intent);
    startTransition(() => run(data));
  };
  const reopen = current ? () => send("reopen", { deploymentId: current.id }) : null;
  const ask = (next: Confirm) => {
    setConfirm(next);
    setConfirmOpen(true);
  };
  const confirmed = () => {
    if (!confirm) return;
    setConfirmOpen(false);
    if (confirm.kind === "unpublish") send("unpublish");
    else send("rollback", { deploymentId: confirm.deployment.id });
  };

  return (
    <>
      <DocumentHeader
        crumbs={[portfolio.title, "배포"]}
        actions={
          <>
            <Link href={editor} className={styles.headGhost}>
              편집으로
            </Link>
            <button
              type="submit"
              form="publish"
              className={styles.headPublish}
              disabled={running || !canPublish}
              title={canPublish ? undefined : "편집 화면에서 먼저 페이지를 만들어 주세요"}
            >
              <Icon name="rocket-launch" size={14} />
              {publishing ? "배포하는 중" : `v${nextVersion} 배포`}
            </button>
          </>
        }
      />
      <AppBody>
        <div className={styles.body}>
          <div className={styles.inner}>
            <h1 className={styles.title}>배포</h1>
            <p className={styles.intro}>
              주소를 발급하고 버전 단위로 공개합니다. 배포하면 이전 버전은 남고, 언제든
              되돌릴 수 있습니다.
            </p>

            <Notice result={result} />

            <StatusHead state={state} deployment={live} busy={running} onReopen={reopen} />

            {/* 주소와 공개 설정 — 다음 배포에 함께 실린다 */}
            <form action={run} id="publish" onSubmit={() => setDoing("publish")}>
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
                      // 브라우저는 pattern을 v 플래그로 읽습니다. 문자 집합 안의 하이픈은 이스케이프해야 유효합니다.
                      pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]"
                      minLength={3}
                      maxLength={63}
                      required
                    />
                    <span className={styles.slugSuffix}>.{PUBLIC_SITE_HOST}</span>
                  </div>
                  <p className={styles.checkNote}>
                    {live
                      ? "주소를 바꿔 배포하면 옛 주소는 30일 동안 새 주소로 넘어갑니다."
                      : "영문 소문자 · 숫자 · 하이픈으로 3자 이상입니다."}
                  </p>
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
                        color={check.ok ? "var(--ex-status-success)" : "var(--ex-status-danger)"}
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
                          {publicSiteHost(deployment.slug)}
                          {/* 구조화 지면은 블록 문서가 없어 0으로 온다. 없는 수를 세어 말하지 않는다. */}
                          {deployment.sectionCount > 0 ? (
                            <span className={styles.versionCount}>
                              {" "}
                              · 섹션 {deployment.sectionCount} · 블록 {deployment.blockCount}
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.versionAt}>
                          {formatWhen(deployment.publishedAt)}
                          {deployment.seoIndexable ? " · 검색 노출" : " · 검색 비노출"}
                          {` · 연락처 ${CONTACT_LABEL[deployment.contactVisibility]}`}
                        </div>
                      </div>
                      {deployment.isCurrent ? (
                        <>
                          <span
                            className={styles.versionCurrent}
                            data-closed={state === "unlisted" ? "true" : undefined}
                          >
                            {state === "unlisted" ? "공개 중단됨" : "공개 중"}
                          </span>
                          {state === "unlisted" && reopen ? (
                            <button
                              type="button"
                              className={styles.versionRevert}
                              disabled={running}
                              onClick={reopen}
                            >
                              다시 공개
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.versionRevert}
                          disabled={running}
                          onClick={() => ask({ kind: "rollback", deployment })}
                        >
                          되돌리기
                        </button>
                      )}
                    </div>
                  ))
                )}

                {state === "live" || state === "changed" ? (
                  <div className={styles.dangerRow}>
                    <span className={styles.checkNote} style={{ flex: 1 }}>
                      공개를 중단하면 주소가 닫힙니다. 문서와 기록은 지워지지 않습니다.
                    </span>
                    <button
                      type="button"
                      className={styles.dangerAction}
                      disabled={running}
                      onClick={() => ask({ kind: "unpublish" })}
                    >
                      공개 중단
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.footNote}>
              <Icon name="info" size={13} color="var(--ex-fg-subtle)" />
              공개를 중단해도 문서와 기록은 지워지지 않습니다. 주소만 접근할 수 없게 됩니다.
            </div>
          </div>
        </div>
      </AppBody>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={styles.confirm}>
          {confirm?.kind === "unpublish" ? (
            <>
              <DialogTitle>공개를 중단할까요?</DialogTitle>
              <DialogDescription>
                {live ? `${publicSiteHost(live.subdomain)} 주소가 바로 닫힙니다. ` : "공개 주소가 바로 닫힙니다. "}
                문서와 배포 기록은 그대로 남고, 언제든 같은 판으로 다시 공개할 수 있습니다.
              </DialogDescription>
            </>
          ) : confirm?.kind === "rollback" ? (
            <>
              <DialogTitle>v{confirm.deployment.version} 판으로 되돌릴까요?</DialogTitle>
              <DialogDescription>
                방문자는 바로 v{confirm.deployment.version} 판을 보게 됩니다. 지금 공개 중인 판은 목록에
                남고, 편집 중인 내용은 바뀌지 않습니다.
              </DialogDescription>
            </>
          ) : null}
          <div className={styles.confirmActions}>
            <button type="button" className={styles.headGhost} onClick={() => setConfirmOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className={confirm?.kind === "unpublish" ? styles.dangerAction : styles.headPublish}
              onClick={confirmed}
            >
              {confirm?.kind === "unpublish" ? "공개 중단" : "되돌리기"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 방금 한 일 한 줄. 공개 주소가 열린 일이면 그 주소로 가는 링크를 함께 둔다. */
function Notice({ result }: { result: DeployResult }) {
  if (result.error) {
    return (
      <div className={`${styles.notice} ${styles.noticeBad}`} role="alert">
        <Icon name="warning-circle" weight="fill" size={14} />
        {result.error}
      </div>
    );
  }
  // 조사를 붙이지 않는다 — v1은 "이", v2는 "가"라 버전마다 틀린 말이 나온다.
  const opened = result.published ?? result.reopened;
  const said = result.published
    ? `배포했습니다 — v${result.published.version}`
    : result.reopened
      ? `다시 공개했습니다 — v${result.reopened.version}`
      : result.rolledBackTo
        ? `되돌렸습니다 — 지금 v${result.rolledBackTo} 사본이 공개 중입니다.`
        : result.unpublished
          ? "공개를 중단했습니다. 주소만 닫혔고 문서와 기록은 그대로입니다."
          : null;
  if (!said) return null;
  return (
    <div className={styles.notice} role="status">
      <Icon name="check-circle" weight="fill" size={14} color="var(--ex-accent-text)" />
      <span>
        {said}
        {opened ? (
          <>
            {" · "}
            <a href={publicSiteUrl(opened.slug)} target="_blank" rel="noreferrer" className={styles.noticeLink}>
              {publicSiteHost(opened.slug)}
            </a>
          </>
        ) : null}
      </span>
    </div>
  );
}

const STATE_TITLE: Record<PublishState, string> = {
  draft: "아직 배포 전",
  live: "공개 중",
  changed: "공개 중",
  unlisted: "공개 중단",
};

const STATE_NOTE: Record<PublishState, string> = {
  draft: "배포하면 아래에서 정한 주소로 열립니다.",
  live: "공개본이 편집본과 같습니다.",
  changed: "배포한 뒤 고친 내용이 아직 나가지 않았습니다. 새 판을 배포하면 함께 나갑니다.",
  unlisted: "주소가 닫혀 있습니다. 같은 판을 같은 주소로 다시 열 수 있습니다.",
};

/** 화면 맨 위의 공개 상태. 공개 주소를 여는 곳과 복사하는 곳이 여기 하나다. */
function StatusHead({
  state,
  deployment,
  busy,
  onReopen,
}: {
  state: PublishState;
  deployment: PortfolioDetail["deployment"];
  busy: boolean;
  onReopen: (() => void) | null;
}) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const url = deployment ? publicSiteUrl(deployment.subdomain) : null;
  const copy = () => {
    if (!url) return;
    // 클립보드는 보안 문맥 · 권한에 따라 없거나 거절된다. 그때는 실패를 그대로 말한다.
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      setCopied("failed");
      return;
    }
    clipboard.writeText(url).then(
      () => setCopied("done"),
      () => setCopied("failed"),
    );
  };

  return (
    <section className={styles.statusHead} data-state={state} aria-label="공개 상태">
      <div className={styles.statusMain}>
        <div className={styles.statusLine}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span className={styles.statusTitle}>{STATE_TITLE[state]}</span>
          {deployment ? <span className={styles.statusVersion}>v{deployment.version}</span> : null}
        </div>
        <p className={styles.statusNote}>{STATE_NOTE[state]}</p>
      </div>
      {deployment && url ? (
        <div className={styles.statusAddress}>
          <span className={styles.statusHost}>{publicSiteHost(deployment.subdomain)}</span>
          <div className={styles.statusActions}>
            {state === "unlisted" ? (
              <button
                type="button"
                className={styles.statusPrimary}
                disabled={busy || !onReopen}
                onClick={onReopen ?? undefined}
              >
                <Icon name="play" size={13} />
                다시 공개
              </button>
            ) : (
              <>
                <a href={url} target="_blank" rel="noreferrer" className={styles.statusPrimary}>
                  <Icon name="arrow-square-out" size={13} />
                  열기
                </a>
                <button type="button" className={styles.statusGhost} onClick={copy}>
                  <Icon name={copied === "done" ? "check" : "copy"} size={13} />
                  {copied === "done" ? "복사함" : copied === "failed" ? "복사하지 못했습니다" : "복사"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
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
