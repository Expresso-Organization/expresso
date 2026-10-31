"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { EvidenceSearchResult, SemanticJobResult, AgentContext } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import { searchCareerEvidence, searchSemanticJobs, syncEvidenceIndex } from "./search-actions";
import styles from "./EvidenceSearch.module.css";

export function SearchResults({ evidence, jobs }: { evidence?: EvidenceSearchResult; jobs?: SemanticJobResult }) {
  const result = evidence ?? jobs;
  return <div className={styles.results}>
    {result ? <><p>{result.meta.mode === "hybrid" ? "벡터·키워드 검색" : "키워드 검색"} · 조회 {result.meta.scanned}개{!result.meta.complete ? " · 일부 범위 결과" : ""}</p>
      {result.meta.notices.map(notice => <p role="status" key={notice}>{notice}</p>)}
      {!result.hits.length ? <p>관련 근거를 찾지 못했습니다. 경험이 없다는 의미는 아닙니다.</p> : null}</> : null}
    {evidence?.hits.map((hit, i) => <article key={`${hit.recordId}:${hit.blockId}:${i}`}><Link href={`/career/records/${hit.recordId}` as Route}>{hit.title}</Link><p>{hit.status === "draft" ? "초안" : hit.status === "organized" ? "정리됨" : "검증됨"} · {hit.source === "body" ? "본문" : hit.source === "title" ? "제목" : "속성"} 근거</p><blockquote>{hit.quote}</blockquote></article>)}
    {jobs?.hits.map(hit => <article key={hit.jobId}><Link href={`/jobs/${hit.jobId}` as Route}>{hit.title}</Link><blockquote>{hit.quote}</blockquote>{hit.reasons.map(reason => <p key={reason}>{reason}</p>)}</article>)}
    {result ? <small>검색 당시 원문입니다. 수정·삭제 후에는 다시 검색하세요. 초안·가상 경험도 검색에 포함될 수 있습니다. 인용과 관련도는 사실·지원 자격의 검증이 아닙니다.</small> : null}
  </div>;
}
export default function EvidenceSearch({ disabled, contexts, onAttach }: { disabled: boolean; contexts: AgentContext[]; onAttach: (ref: AgentContext, title: string) => void }) {
  const [query, setQuery] = useState(""); const [mode, setMode] = useState<"keyword" | "hybrid">("keyword");
  const [kind, setKind] = useState<"career" | "jobs">("career");
  const [evidence, setEvidence] = useState<EvidenceSearchResult>(); const [jobs, setJobs] = useState<SemanticJobResult>();
  const [location, setLocation] = useState(""); const [experience, setExperience] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const lock = useRef(false);
  function clearResults() { setEvidence(undefined); setJobs(undefined); }
  const contextKey = contexts.map(item => `${item.kind}:${item.id}`).join("|");
  useEffect(() => { setEvidence(undefined); setJobs(undefined); }, [contextKey]);
  async function execute(sync = false) {
    if (disabled || lock.current) return;
    if (!sync && !query.trim()) { setError("검색할 내용을 입력하세요."); return; }
    const years = experience.trim() ? Number(experience) : undefined;
    if (years !== undefined && (!Number.isInteger(years) || years < 0 || years > 50)) { setError("경력은 0~50 사이의 정수로 입력하세요."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (sync) { const response = await syncEvidenceIndex(); if (response.ok) setNotice(`기록 ${response.data.indexed}개 색인 확인${response.data.complete ? " 완료" : " · 일부 범위"}`); else setError(response.error); return; }
      setEvidence(undefined); setJobs(undefined);
      if (kind === "career") { const response = await searchCareerEvidence({ query, mode, limit: 8 }); if (response.ok) setEvidence(response.data); else setError(response.error); }
      else { const response = await searchSemanticJobs({ query, mode, limit: 8, recordIds: contexts.filter(x => x.kind === "record").slice(0, 8).map(x => x.id), filters: { ...(location.trim() ? { location: location.trim() } : {}), ...(years !== undefined ? { experience: years } : {}) } }); if (response.ok) setJobs(response.data); else setError(response.error); }
    } catch { setError("검색을 완료하지 못했습니다. 다시 시도하세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.root} aria-label="경력 근거·공고 검색"><h3>경력 근거·공고 검색</h3>
    <p>경력 전체에서 관련 원문을 찾거나, 연결한 경력 최대 8개를 참고해 공고를 검색합니다. 자연어에 적은 지역·경력 조건은 아래 필터에도 명시하세요.</p>
    <fieldset disabled={disabled || busy}><legend>검색 설정</legend>
      <label>검색 대상<select value={kind} onChange={e => { setKind(e.target.value as "career" | "jobs"); clearResults(); }}><option value="career">내 경력 근거</option><option value="jobs">관련 공고</option></select></label>
      <label>검색 방식<select value={mode} onChange={e => { setMode(e.target.value as "keyword" | "hybrid"); clearResults(); }}><option value="keyword">키워드</option><option value="hybrid">벡터·키워드</option></select></label>
      <label>검색 요청<input maxLength={300} value={query} onChange={e => { setQuery(e.target.value); clearResults(); }} /></label>
      {kind === "jobs" ? <><label>필수 지역<input value={location} onChange={e => { setLocation(e.target.value); clearResults(); }} /></label><label>내 경력 연수<input type="number" min={0} max={50} value={experience} onChange={e => { setExperience(e.target.value); clearResults(); }} /></label></> : null}
      <div className={styles.actions}><Button onClick={() => void execute()}>검색</Button><Button variant="outline" onClick={() => void execute(true)}>경력 색인 동기화</Button></div>
    </fieldset>
    {busy ? <p role="status">검색·색인 확인 중…</p> : null}{error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <SearchResults {...(evidence ? { evidence } : {})} {...(jobs ? { jobs } : {})} />
    {jobs?.hits.map(hit => <Button key={hit.jobId} disabled={disabled || busy || contexts.some(x => x.kind === "job" && x.id === hit.jobId)} onClick={() => onAttach({ kind: "job", id: hit.jobId }, hit.title)}>{hit.title} 대화에 연결</Button>)}
  </section>;
}
