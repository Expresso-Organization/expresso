"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runRecommendation } from "./action";
import jobStyles from "../page.module.css";
import styles from "./results.module.css";

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
    <section className={styles.results} aria-busy={pending}>
      <form action={action} className={styles.actions}>
        <Button className={`${jobStyles.brewCta} ${styles.action}`} type="submit" disabled={pending} name="mode" value="local">
          {posting ? "근거 찾기" : "추천받기"}
        </Button>
        {decisions && (
          <>
            <Button
              type="submit"
              className={`${jobStyles.brewCta} ${styles.action} ${styles.secondary}`}
              variant="outline"
              disabled={pending}
              name="mode"
              value="external"
            >
              {posting ? "Decisions로 근거 검증" : "Decisions로 추천 순서 조정"}
            </Button>
            <p className={styles.note}>
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
            <ol className={styles.jobs}>
              {result.jobs.map((job) => (
                <li key={job.jobId} className={styles.job}>
                  <h2 className={styles.jobTitle}>
                    <Link href={`/jobs/${job.jobId}`}>{job.title}</Link>
                  </h2>
                  <p>
                    모델 점수 {job.localScore.toFixed(1)}점
                    {job.decisionScore !== null &&
                      ` · Decisions ${job.decisionScore.toFixed(1)}점`}
                  </p>
                  {posting ? (
                    <ul className={styles.criteria}>
                      {job.evidence.map((item, i) => (
                        <li key={i} className={styles.criterion}>
                          <h3 className={styles.label}>{item.label}</h3>
                          {item.records.length ? (
                            <ul className={styles.records}>
                              {item.records.map((r) => (
                                <li key={r.recordId} className={styles.record}>
                                  <Link
                                    className={styles.recordLink}
                                    href={`/career/records/${r.recordId}`}
                                  >
                                    {r.title}
                                  </Link>
                                  {r.quote && <blockquote className={styles.quote}>{r.quote.text}</blockquote>}
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
                      className={styles.recordLink}
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
