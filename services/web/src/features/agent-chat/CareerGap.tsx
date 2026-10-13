"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentMessage, AnalyzeCareerGap, CareerGapResult } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import { analyzeCareerGap, loadCareerGap } from "./gap-actions";
import styles from "./CareerGap.module.css";
const TYPES = { evidence: "경험 근거", experience: "업무 경험", skill: "기술·역량", qualification: "지원 자격", portfolio: "포트폴리오" };
const PRIORITIES = { high: "높음", medium: "보통", low: "낮음" };
const ACTIONS = { interview: "추가 질문", explore_experience: "유사 경험 탐색", prepare: "학습·프로젝트 준비", check_qualification: "자격 조건 확인", improve_portfolio: "포트폴리오 보완" };
export default function CareerGap({ conversationId, messages, disabled = false }: { conversationId: string; messages: Pick<AgentMessage, "id" | "role" | "text">[]; disabled?: boolean }) {
  const [result, setResult] = useState<CareerGapResult | null>(null);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<AnalyzeCareerGap | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadCareerGap(conversationId).then((response) => {
      if (cancelled) return;
      if (response.ok) { setResult(response.data); setStale(response.stale); }
      else setError(response.error);
    }).catch(() => { if (!cancelled) setError("저장 결과를 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [conversationId]);
  async function run(input: AnalyzeCareerGap) {
    if (busyRef.current || busy || disabled) return;
    busyRef.current = true; setBusy(true); setError(""); setRetry(input);
    try {
      const response = await analyzeCareerGap(conversationId, input);
      if (!response.ok) { setError(response.error); return; }
      setResult(response.data); setStale(false); setRetry(null);
    } catch { setError("분석 요청에 실패했습니다. 같은 요청으로 재시도할 수 있습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function reload() {
    if (busyRef.current || busy || disabled) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const response = await loadCareerGap(conversationId);
      if (response.ok) { setResult(response.data); setStale(response.stale); }
      else setError(response.error);
    } catch { setError("저장 결과를 불러오지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const answers = messages.filter((item) => item.role === "user" && item.text.trim() !== "내 경력에서 보완할 경험을 질문해줘.");
  const blocked = busy || disabled;
  return <section className={styles.root} aria-label="경력 Gap 분석">
    <h2>경력 Gap 분석</h2>
    <p>경험 근거·업무 경험·기술·지원 자격·포트폴리오에서 확인하거나 보완할 부분을 구분합니다.</p>
    <p>현재 경력으로 P3 맞춤 분석을 먼저 실행하세요. 추가로 참고할 실제 경험 답변만 선택하세요. 선택하지 않으면 공고와 경력 기록만 사용합니다.</p>
    <details><summary>참고할 사용자 답변 선택 ({selected.length}/20)</summary>
      {answers.map((answer) => <label className={styles.answer} key={answer.id}>
        <input type="checkbox" checked={selected.includes(answer.id)} disabled={blocked || (!selected.includes(answer.id) && selected.length >= 20)} onChange={() => {
          setSelected((ids) => ids.includes(answer.id) ? ids.filter((id) => id !== answer.id) : [...ids, answer.id]); setRetry(null);
        }} />
        <span>{answer.text}</span>
      </label>)}
      {!answers.length ? <p>아직 저장된 사용자 답변이 없습니다.</p> : null}
    </details>
    <div className={styles.actions}>
      <Button disabled={blocked} onClick={() => void run({ requestId: crypto.randomUUID(), messageIds: selected })}>새 Gap 분석</Button>
      <Button variant="outline" disabled={blocked} onClick={() => void reload()}>저장 결과 불러오기</Button>
      {retry ? <Button variant="outline" disabled={blocked} onClick={() => void run(retry)}>같은 요청 재시도</Button> : null}
    </div>
    {busy ? <p role="status">Gap 분석 또는 저장 결과를 확인하고 있습니다…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!busy && !error && !result ? <p>아직 저장된 Gap 분석이 없습니다.</p> : null}
    {result ? <div aria-live="polite">
      {stale ? <p role="status">분석 입력이 변경됐습니다. P3를 새로 분석한 뒤 Gap 분석도 다시 실행하세요.</p> : null}
      <p>{result.summary}</p>
      <p>분석 시각: {new Date(result.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      <p>분석 당시 자료와 선택한 발언을 기준으로 한 결과이며, 인용문 존재 검증이 의미상 정확성까지 보장하지는 않습니다.</p>
      {!result.items.length ? <p>제공된 자료에서 추가 Gap 후보가 확인되지 않았습니다. 모든 지원 조건 충족을 의미하지는 않습니다.</p> : null}
      {result.items.map((item) => <article className={styles.item} key={item.id}>
        <h3>{item.requirement}</h3>
        <p>{TYPES[item.type]} · {item.status === "needs_confirmation" ? "확인 필요" : "보완 필요"} · 우선순위 {PRIORITIES[item.priority]}</p>
        <p>{item.explanation}</p>
        <p>다음 행동: {ACTIONS[item.nextAction]}</p><p>{item.suggestedAction}</p>
        <details><summary>인용 근거 확인</summary>{item.evidence.map((ref, index) => <blockquote key={`${ref.sourceType}:${ref.sourceId}:${index}`}>
          <small>{ref.sourceType === "job" ? "공고" : ref.sourceType === "record" ? "경력 기록" : "사용자 발언"}</small><p>{ref.quote}</p>
        </blockquote>)}</details>
      </article>)}
    </div> : null}
  </section>;
}
