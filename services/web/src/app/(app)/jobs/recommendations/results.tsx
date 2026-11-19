"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runRecommendation } from "./action";

export function Results({
  posting,
  decisions,
}: {
  posting: string | undefined;
  decisions: boolean;
}) {
  const [result, action, pending] = useActionState(
    runRecommendation.bind(null, posting),
    null,
  );
  return (
    <section className="space-y-5" aria-busy={pending}>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} name="mode" value="local">
          {posting ? "근거 찾기" : "추천받기"}
        </Button>
        {decisions && (
          <>
            <Button
              type="submit"
              variant="outline"
              disabled={pending}
              name="mode"
              value="external"
            >
              {posting ? "Decisions로 근거 검증" : "Decisions로 추천 순서 조정"}
            </Button>
            <p className="w-full text-sm">
              Decisions를 선택하면 공고와 관련 경력 내용이 OpenAI에 전송됩니다.
            </p>
          </>
        )}
      </form>
      {pending && <p role="status">공고 요건과 기록을 대조하고 있습니다.</p>}
      {typeof result === "string" && <p role="alert">{result}</p>}
      {result &&
        typeof result !== "string" &&
        (result.status !== "ok" ? (
          <p role="status">
            {
              {
                unavailable: "모델 연결이 끊겼습니다. 다시 시도하세요.",
                insufficient_records:
                  "정리됨 또는 검증됨 상태의 커리어 기록을 추가하세요.",
                no_requirements: result.examined
                  ? "평가 가능한 한국어 공고 요건을 찾지 못했습니다."
                  : "현재 모집 중인 공고가 없습니다.",
              }[result.status]
            }
          </p>
        ) : (
          <>
            <p>
              {result.examined}개 공고 중 {result.eligible}개 평가 ·{" "}
              {result.source === "decisions"
                ? "Decisions 적용"
                : result.source === "fallback"
                  ? "Decisions를 사용할 수 없어 로컬 모델 결과를 표시합니다."
                  : "로컬 모델"}
            </p>
            <ol className="space-y-5">
              {result.jobs.map((job) => (
                <li key={job.jobId} className="space-y-2 rounded-lg border p-4">
                  <h2 className="font-semibold">
                    <Link href={`/jobs/${job.jobId}`}>{job.title}</Link>
                  </h2>
                  <p>
                    모델 점수 {job.localScore.toFixed(1)}점
                    {job.decisionScore !== null &&
                      ` · Decisions ${job.decisionScore.toFixed(1)}점`}
                  </p>
                  {posting ? (
                    <ul className="space-y-3">
                      {job.evidence.map((item, i) => (
                        <li key={i}>
                          <strong>{item.label}</strong>
                          {item.records.length ? (
                            <ul>
                              {item.records.map((r) => (
                                <li key={r.recordId}>
                                  <Link
                                    className="underline"
                                    href={`/career/records/${r.recordId}`}
                                  >
                                    {r.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>이 요건을 뒷받침할 기록을 찾지 못했습니다.</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Link
                      className="underline"
                      href={`/jobs/recommendations?posting=${job.jobId}`}
                    >
                      요건별 근거 보기
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </>
        ))}
    </section>
  );
}
