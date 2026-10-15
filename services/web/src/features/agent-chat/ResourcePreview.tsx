"use client";
import { useEffect, useState } from "react";
import { AgentResourceDetailSchema, type AgentContext, type AgentResourceDetail } from "@expresso/contracts";
import { careerDocumentToMarkdown } from "@expresso/editor";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { MarkdownBody } from "@/components/ui/Markdown";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";
import { PagePreview } from "@/components/portfolio/PagePreview";
import styles from "./AgentChat.module.css";
export type PreviewResource = AgentContext & { title: string };
export function ResourcePreview({ resource, onClose, selected, disabled, onToggle }: { resource: PreviewResource; onClose(): void; selected: boolean; disabled: boolean; onToggle(ref: AgentContext, title: string): void }) {
  const [detail, setDetail] = useState<AgentResourceDetail | null>(null);
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setDetail(null); setError(false);
    const kind = resource.kind === "job" ? "jobs" : resource.kind === "record" ? "records" : "portfolios";
    void fetch(`/api/agent/resources/${kind}/${resource.id}`, { signal: abort.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error(); const data = AgentResourceDetailSchema.parse(await response.json()); if (!abort.signal.aborted) setDetail(data); }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [resource.kind, resource.id, retry]);
  const title = detail?.data.title || resource.title;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={`acf-scope ${styles.resourceDialog}`} showCloseButton={false}>
    <DialogHeader className={styles.previewHeader}><div><DialogDescription>{resource.kind === "job" ? "채용 공고" : resource.kind === "record" ? "커리어 기록" : "내 포트폴리오"}</DialogDescription><DialogTitle>{title}</DialogTitle></div><Button variant="ghost" size="icon" aria-label="자료 미리보기 닫기" onClick={onClose}><Icon name="x" size={18} /></Button></DialogHeader>
    <div className={styles.previewBody}>
      {error ? <div role="alert"><p>자료를 불러오지 못했습니다.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div> : !detail ? <p role="status">자료 불러오는 중…</p> : detail.kind === "job" ? <><p className={styles.previewMeta}>{[detail.data.company.name, detail.data.location, detail.data.experienceLabel, detail.data.employmentType].filter(Boolean).join(" · ")}</p><MarkdownBody>{detail.data.descriptionRaw || "등록된 공고 본문이 없습니다."}</MarkdownBody></> : detail.kind === "record" ? <><p className={styles.previewMeta}>최근 수정 {new Date(detail.data.updatedAt).toLocaleDateString("ko-KR")}</p><MarkdownBody>{careerDocumentToMarkdown(detail.document.document) || detail.data.bodyMd || "작성된 기록 본문이 없습니다."}</MarkdownBody></> : detail.page ? <PagePreview page={detail.page} title={detail.data.title} className={styles.portfolioFrame ?? ""} /> : <PortfolioPage portfolio={detail.data} />}
    </div>
    <DialogFooter className={styles.previewFooter}><span>{selected ? "현재 AI 대화에 연결된 자료입니다." : "내용을 확인하고 AI에게 참고 자료로 전달할 수 있습니다."}</span><Button disabled={disabled || !detail} variant={selected ? "outline" : "default"} onClick={() => onToggle({ kind: resource.kind, id: resource.id }, title)}>{selected ? "AI 문맥에서 제외" : "AI 문맥에 추가"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
