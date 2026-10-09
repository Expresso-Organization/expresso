"use client";

import type { JobCareerMatchResult } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";

import {
  analyzeJobCareerMatch,
  loadJobCareerMatch,
} from "./match-actions";

const ASSESSMENT_LABEL = {
  strong: "강점",
  partial: "보완 필요",
  unconfirmed: "기록에서 미확인",
};

const ASSESSMENT_COLOR = {
  strong: "#e8f5e9",
  partial: "#fff8e1",
  unconfirmed: "#f3f4f6",
};

const KIND_LABEL = {
  must: "필수 조건",
  nice: "우대 조건",
  responsibility: "주요 업무",
};

export default function CareerMatch({
  sessionId,
}: {
  sessionId: string;
}) {
  const [result, setResult] =
    useState<JobCareerMatchResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryRequestId, setRetryRequestId] =
    useState<string | null>(null);

  // 상태 갱신 전의 연속 클릭도 방지합니다.
  const busyRef = useRef(false);

  // 화면 진입 또는 새로고침 시 마지막 완료 결과를 복원합니다.
  useEffect(() => {
    let cancelled = false;

    async function loadInitialResult() {
      try {
        const response = await loadJobCareerMatch(sessionId);

        if (cancelled) return;

        if (!response.ok) {
          setError(response.error);
          return;
        }

        setResult(response.data);
      } catch {
        if (!cancelled) {
          setError("저장된 분석 결과를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialResult();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function reloadResult() {
    if (busyRef.current || loading) return;

    busyRef.current = true;
    setLoading(true);
    setError("");

    try {
      const response = await loadJobCareerMatch(sessionId);

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response.data);

      // 실패한 요청이 실제로 완료됐다면 재시도 상태를 해제합니다.
      // 이전 분석 결과가 조회된 경우에는 재시도 ID를 유지합니다.
      if (
        response.data &&
        response.data.requestId === retryRequestId
      ) {
        setRetryRequestId(null);
      }
    } catch {
      setError("저장된 분석 결과를 불러오지 못했습니다.");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  async function runAnalysis(requestId: string) {
    if (busyRef.current || loading) return;

    busyRef.current = true;
    setPending(true);
    setError("");
    setRetryRequestId(requestId);

    try {
      const response = await analyzeJobCareerMatch({
        sessionId,
        requestId,
      });

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response.data);
      setRetryRequestId(null);
    } catch {
      setError(
        "맞춤 분석 요청에 실패했습니다. 저장된 결과를 확인하거나 같은 요청을 재시도해 주세요.",
      );
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }

  const disabled = loading || pending;

  const recordTitles = new Map(
    result?.inputSnapshot.records.map((record) => [
      record.recordId,
      record.title,
    ]) ?? [],
  );

  return (
    <section
      aria-labelledby="career-match-heading"
      style={{
        marginTop: 32,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 12,
      }}
    >
      <h2 id="career-match-heading">공고 × 내 경력 맞춤 분석</h2>

      <p>
        Career Record와 공고를 비교해 강점, 보완점,
        지원 준비에 활용할 경험을 정리합니다.
      </p>

      <p>
        기록에서 확인되지 않은 역량은 보유 여부를 단정하지 않습니다.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => void runAnalysis(crypto.randomUUID())}
        >
          {pending
            ? "분석 중…"
            : result
              ? "현재 경력으로 새로 분석"
              : "내 경력과 맞춤 분석"}
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => void reloadResult()}
        >
          저장된 결과 다시 불러오기
        </button>

        {retryRequestId && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void runAnalysis(retryRequestId)}
          >
            같은 요청 재시도
          </button>
        )}
      </div>

      {loading && (
        <p role="status">저장된 분석 결과를 불러오는 중…</p>
      )}

      {pending && (
        <p role="status">
          공고와 경력을 분석하고 있습니다. 잠시 기다려 주세요.
        </p>
      )}

      {error && <p role="alert">{error}</p>}

      {!loading && !pending && !result && !error && (
        <p>
          아직 저장된 분석 결과가 없습니다.
          경력 기록을 작성한 뒤 분석을 실행하세요.
        </p>
      )}

      {result && (
        <div aria-live="polite" style={{ marginTop: 20 }}>
          <h3>분석 요약</h3>

          <p style={{ whiteSpace: "pre-wrap" }}>
            {result.summary}
          </p>

          <p>
            분석 시각:{" "}
            {new Date(result.createdAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>

          <p>
            분석에 사용한 경력:{" "}
            {result.inputSnapshot.records.length}개
          </p>

          <p>
            이 결과는 분석 당시 입력을 기준으로 작성되었습니다.
            공고나 경력을 수정했다면 새로 분석하세요.
          </p>

          {result.inputSnapshot.inputTruncated && (
            <p>
              입력 길이 또는 개수 제한으로 일부 자료가 제외되었습니다.
              미확인 항목에 해당하는 경력이 제외되었을 수 있습니다.
            </p>
          )}

          {result.items.map((item, index) => (
            <article
              key={`${result.id}-${index}`}
              style={{
                padding: 16,
                marginTop: 12,
                borderRadius: 12,
                background: ASSESSMENT_COLOR[item.assessment],
              }}
            >
              <small>{KIND_LABEL[item.kind]}</small>

              <h3>{item.requirement}</h3>

              <strong>
                {ASSESSMENT_LABEL[item.assessment]}
              </strong>

              <p style={{ whiteSpace: "pre-wrap" }}>
                {item.explanation}
              </p>

              <details>
                <summary>공고 근거 확인</summary>
                <blockquote style={{ whiteSpace: "pre-wrap" }}>
                  {item.jobQuote}
                </blockquote>
              </details>

              {item.evidence.length > 0 && (
                <div>
                  <h4>활용할 경력 근거</h4>

                  {item.evidence.map((evidence, evidenceIndex) => (
                    <div
                      key={`${evidence.recordId}-${evidenceIndex}`}
                    >
                      <strong>
                        {recordTitles.get(evidence.recordId) ??
                          "경력 기록"}
                      </strong>

                      <blockquote
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {evidence.quote}
                      </blockquote>
                    </div>
                  ))}
                </div>
              )}

              <h4>활용·보완 방법</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {item.recommendation}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}