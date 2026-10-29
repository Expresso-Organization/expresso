"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type {
  CareerWorkflow as Run,
  WorkflowClaim,
  WorkflowInput,
  WorkflowIntent,
} from "@expresso/contracts";

import { Button } from "@/components/ui/button";
import {
  loadCareerWorkflows,
  createCareerWorkflow,
  reviewCareerWorkflow,
  decideCareerWorkflow,
  retryFailedPostingAnalysis,
} from "./workflow-actions";

import styles from "./CareerWorkflow.module.css";

const INTENTS = {
  unknown: "요청으로 판단",
  portfolio: "포트폴리오 제작 연결",
  match: "공고와 경력 비교",
  interview: "추가 질문",
  gap: "보완점 정리",
  preparation: "준비 계획",
  record: "경력 기록 초안",
};

const STATUS = {
  waiting_for_input: "입력 확인 필요",
  waiting_for_approval: "사용자 확인 대기",
  review_required: "문장 근거 검토 필요",
  handed_off: "다음 작업 연결 준비 완료",
  cancelled: "중단",
};

function WorkflowCard({
  run,
  busy,
  onReview,
  onDecision,
  onSend,
}: {
  run: Run;
  busy: boolean;
  onReview: (claims: WorkflowClaim[]) => Promise<void>;
  onDecision: (action: "advance" | "cancel") => Promise<void>;
  onSend: (text: string) => void;
}) {
  const [claims, setClaims] = useState(run.claims);
  const [notice, setNotice] = useState("");
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const retryingRef = useRef(false);

  const terminal =
    run.status === "handed_off" ||
    run.status === "cancelled";

  const controlsDisabled = busy || retryingAnalysis;

  const claimsChanged =
    JSON.stringify(claims) !== JSON.stringify(run.claims);

  async function retryAnalysis() {
    if (!run.job || busy || retryingRef.current) return;

    retryingRef.current = true;
    setRetryingAnalysis(true);
    setNotice("");

    try {
      const response = await retryFailedPostingAnalysis(run.job.id);

      setNotice(
        response.ok ? response.message : response.error,
      );
    } catch {
      setNotice("재시도 요청에 실패했습니다. 다시 시도하세요.");
    } finally {
      retryingRef.current = false;
      setRetryingAnalysis(false);
    }
  }

  return (
    <article className={styles.card}>
      <h4>
        {INTENTS[run.intent]} · {STATUS[run.status]}
      </h4>

      <p>{run.requestText}</p>

      {run.question ? (
        <p role="status">
          {run.question} 자료·선택을 바꾼 뒤 새 작업 계획을 만드세요.
        </p>
      ) : null}

      <ol>
        {run.steps.map((step) => (
          <li key={step.key}>
            {step.label} —{" "}
            {step.status === "complete"
              ? "확인됨"
              : step.status === "waiting"
                ? "검토 대기"
                : "예정"}
          </li>
        ))}
      </ol>

      {run.job ? (
        <p>목표 공고: {run.job.title}</p>
      ) : null}

      {run.gap ? (
        <details>
          <summary>
            참고한 보완점
            {run.gap.stale ? " · 이전 자료 기준" : ""}
          </summary>

          <p>{run.gap.summary}</p>
          <p>
            보완점은 준비 참고이며 보유 경험으로 생성하지 않습니다.
          </p>
        </details>
      ) : null}

      {run.records.map((record) => (
        <details key={record.id}>
          <summary>
            {record.title}
            {record.truncated ? " · 본문 일부" : ""}
          </summary>

          <pre className={styles.source}>{record.text}</pre>
        </details>
      ))}

      {run.brewId && !terminal ? (
        <>
          <p>
            사용할 문장과 원문을 검토하세요. 문장 수정 후 반드시 다시
            검토해야 합니다. 원문 자체가 외부 검증된 사실임을 뜻하지
            않습니다.
          </p>

          {claims.map((claim, index) => (
            <div className={styles.claim} key={claim.id}>
              <label>
                사용할 문장
                <textarea
                  disabled={controlsDisabled}
                  value={claim.text}
                  maxLength={1000}
                  onChange={(event) => {
                    const text = event.target.value;

                    setClaims((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, text }
                          : item,
                      ),
                    );

                    setNotice(
                      "수정한 문장은 다시 근거 검토해야 합니다.",
                    );
                  }}
                />
              </label>

              {claim.sources.map((source, sourceIndex) => (
                <label key={`${source.recordId}:${sourceIndex}`}>
                  인용 원문
                  <textarea
                    disabled={controlsDisabled}
                    value={source.quote}
                    maxLength={1500}
                    onChange={(event) => {
                      const quote = event.target.value;

                      setClaims((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex !== index
                            ? item
                            : {
                                ...item,
                                sources: item.sources.map(
                                  (currentSource, currentIndex) =>
                                    currentIndex === sourceIndex
                                      ? { ...currentSource, quote }
                                      : currentSource,
                                ),
                              },
                        ),
                      );

                      setNotice(
                        "수정한 인용은 다시 검토해야 합니다.",
                      );
                    }}
                  />
                </label>
              ))}

              {!claimsChanged
                ? run.review?.items
                    .filter((item) => item.claimId === claim.id)
                    .map((item) => (
                      <p key={item.claimId}>
                        {item.status === "supported"
                          ? "근거 연결 확인"
                          : item.status === "contradicted"
                            ? "원문과 모순"
                            : "추가 확인 필요"}{" "}
                        · {item.reason}
                      </p>
                    ))
                : null}
            </div>
          ))}

          {!claims.length ? (
            <p>
              짧은 원문 행을 찾지 못했습니다. 기록 내용을 보완한 뒤
              새 작업 계획을 만드세요.
            </p>
          ) : null}

          <Button
            disabled={controlsDisabled || !claims.length}
            onClick={() => void onReview(claims)}
          >
            수정한 문장·근거 검토
          </Button>

          <p>
            원문 복사 검토는 AI를 호출하지 않습니다. 바꿔 쓴 문장은
            AI 설정에 따라 외부 모델로 전달되어 검토됩니다.
          </p>
        </>
      ) : null}

      {/* 재료 생성 전에도 재시도 결과를 표시합니다. */}
      {notice ? <p role="status">{notice}</p> : null}

      <div className={styles.actions}>
        {run.status === "waiting_for_approval" ? (
          <Button
            disabled={
              controlsDisabled ||
              (Boolean(run.brewId) && claimsChanged)
            }
            onClick={() => void onDecision("advance")}
          >
            {run.intent !== "portfolio"
              ? "다음 요청 확인"
              : run.brewId
                ? "검토한 근거 확인·제작 연결"
                : "선택 기록 확인·제작 재료 준비"}
          </Button>
        ) : null}

        {run.intent === "portfolio" &&
        run.job &&
        !run.brewId &&
        run.status === "waiting_for_approval" ? (
          <Button
            variant="outline"
            disabled={controlsDisabled}
            onClick={() => void retryAnalysis()}
          >
            {retryingAnalysis
              ? "분석 상태 확인 중…"
              : "설정 수정 후 공고 분석 다시 시도"}
          </Button>
        ) : null}

        {!terminal ? (
          <Button
            variant="outline"
            disabled={controlsDisabled}
            onClick={() => void onDecision("cancel")}
          >
            이 작업 중단
          </Button>
        ) : null}

        {run.nextPath ? (
          <Link href={run.nextPath as Route}>
            기존 포트폴리오 제작 화면 열기
          </Link>
        ) : null}

        {run.status === "handed_off" &&
        run.intent !== "portfolio" &&
        run.steps[0] ? (
          <Button
            disabled={controlsDisabled}
            onClick={() => onSend(run.steps[0]!.label)}
          >
            확인한 요청을 채팅으로 보내기
          </Button>
        ) : null}
      </div>

      <small>
        버전 {run.version} ·{" "}
        {new Date(run.updatedAt).toLocaleString("ko-KR")}
      </small>
    </article>
  );
}

export default function CareerWorkflow({
  conversationId,
  lastUserText,
  disabled,
  onSend,
}: {
  conversationId: string;
  lastUserText: string;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [options, setOptions] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
    }>
  >([]);

  const [text, setText] = useState(
    "이 공고에 맞는 포트폴리오를 만들고 싶어.",
  );
  const [intent, setIntent] = useState<WorkflowIntent>("unknown");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const active = useRef(false);
  const retry = useRef<WorkflowInput | null>(null);

  useEffect(() => {
    let alive = true;

    setBusy(true);
    setError("");
    setRuns([]);
    setOptions([]);
    setSelected([]);
    retry.current = null;

    void loadCareerWorkflows(conversationId)
      .then((response) => {
        if (!alive) return;

        if (response.ok) {
          setRuns(response.runs);
          setOptions(response.options);
        } else {
          setError(response.error);
        }
      })
      .catch(() => {
        if (alive) {
          setError("작업 계획을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (alive) setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [conversationId]);

  async function action(fn: () => Promise<void>) {
    if (disabled || busy || active.current) return;

    active.current = true;
    setBusy(true);
    setError("");

    try {
      await fn();
    } catch {
      setError(
        "요청에 실패했습니다. 저장 목록을 다시 불러오세요.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  function accept(run: Run) {
    setRuns((items) =>
      [run, ...items.filter((item) => item.id !== run.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20),
    );
  }

  return (
    <section
      className={styles.root}
      aria-label="다음 작업 계획"
    >
      <h3>다음 작업 계획</h3>

      <p>
        요청과 선택 자료를 확인해 기존 기능으로 연결합니다.
        제작·AI 검토·채팅 실행은 버튼에서 확인한 뒤 진행합니다.
      </p>

      <label>
        원하는 작업
        <textarea
          value={text}
          maxLength={4000}
          disabled={busy || disabled}
          onChange={(event) => {
            setText(event.target.value);
            retry.current = null;
          }}
        />
      </label>

      <Button
        variant="outline"
        disabled={busy || disabled || !lastUserText}
        onClick={() => {
          setText(lastUserText.slice(0, 4000));
          retry.current = null;
        }}
      >
        최근 내 요청 가져오기
      </Button>

      <label>
        작업 종류
        <select
          disabled={busy || disabled}
          value={intent}
          onChange={(event) => {
            setIntent(event.target.value as WorkflowIntent);
            retry.current = null;
          }}
        >
          {Object.entries(INTENTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <fieldset disabled={busy || disabled}>
        <legend>
          포트폴리오에 사용할 기록 ({selected.length}/8)
        </legend>

        {options.map((record) => (
          <label
            className={styles.option}
            key={record.id}
          >
            <input
              type="checkbox"
              checked={selected.includes(record.id)}
              disabled={
                selected.length >= 8 &&
                !selected.includes(record.id)
              }
              onChange={(event) => {
                const checked = event.target.checked;

                setSelected((ids) =>
                  checked
                    ? [...new Set([...ids, record.id])].slice(0, 8)
                    : ids.filter((id) => id !== record.id),
                );

                retry.current = null;
              }}
            />

            {record.title}
          </label>
        ))}

        {!options.length ? (
          <p>
            정리됨·검증됨 상태의 기록이 필요합니다.{" "}
            <Link href="/career/experience">
              내 기록 열기
            </Link>
          </p>
        ) : null}
      </fieldset>

      <div className={styles.actions}>
        <Button
          disabled={busy || disabled || !text.trim()}
          onClick={() =>
            void action(async () => {
              const input = retry.current ?? {
                requestId: crypto.randomUUID(),
                text,
                intent,
                recordIds: selected,
              };

              retry.current = input;

              const response = await createCareerWorkflow(
                conversationId,
                input,
              );

              if (response.ok) {
                accept(response.data);
                retry.current = null;
              } else {
                setError(response.error);
              }
            })
          }
        >
          작업 계획 확인
        </Button>

        <Button
          variant="outline"
          disabled={busy || disabled}
          onClick={() =>
            void action(async () => {
              const response =
                await loadCareerWorkflows(conversationId);

              if (response.ok) {
                setRuns(response.runs);
                setOptions(response.options);
              } else {
                setError(response.error);
              }
            })
          }
        >
          저장된 작업 다시 불러오기
        </Button>
      </div>

      {busy ? <p role="status">처리 중…</p> : null}

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {runs.map((run) => (
        <WorkflowCard
          key={`${run.id}:${run.version}`}
          run={run}
          busy={busy || disabled}
          onSend={onSend}
          onReview={(claims) =>
            action(async () => {
              const response = await reviewCareerWorkflow(
                conversationId,
                run.id,
                {
                  expectedVersion: run.version,
                  claims,
                },
              );

              if (response.ok) {
                accept(response.data);
              } else {
                setError(response.error);
              }
            })
          }
          onDecision={(decision) =>
            action(async () => {
              const response = await decideCareerWorkflow(
                conversationId,
                run.id,
                run.version,
                decision,
              );

              if (response.ok) {
                accept(response.data);
              } else {
                setError(response.error);
              }
            })
          }
        />
      ))}
    </section>
  );
}