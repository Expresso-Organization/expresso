"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { AGENT_ATTACHMENT_LIMIT, MEDIA_MIME_TYPES, mediaAssetUrl, type AgentAttachment, type AgentWorkMaterials } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/toast";
import { uploadCareerMediaAction } from "@/features/career-editor/editor/media-actions";
import { API_BASE_URL } from "@/lib/api/client";
import styles from "./WorkMaterials.module.css";

/**
 * 작업물 재료 — 채팅에 붙이는 화면 그림과, 에이전트가 기록에 붙인 것을 보이는 카드(`intent_work-materials.md`).
 *
 * 그림은 고르는 즉시 미디어로 올리고 그 id만 들고 있다가 보낼 때 메시지에 싣는다. 에이전트가 그 id로 그림을 기록에 붙인다.
 */
interface Pending { key: string; name: string; mediaId: string | null; preview: string }
interface AttachmentsState { items: Pending[]; add(files: File[]): void; remove(key: string): void; take(): AgentAttachment[] | null; uploading: boolean }

const AttachmentsContext = createContext<AttachmentsState | null>(null);

const mediaIdOf = (url: string | undefined) => /^\/v1\/media\/([0-9a-f-]{36})$/i.exec(url ?? "")?.[1] ?? null;
export const mediaSrc = (src: string) => { const id = mediaIdOf(src); return id ? mediaAssetUrl(API_BASE_URL, id) : src; };

/** 붙일 그림의 상태. 보내는 쪽(채팅의 onNew)과 입력창이 함께 쓰므로 채팅 부품이 만들어 `AttachmentsProvider`로 내린다. */
export function useAttachmentState(): AttachmentsState {
  const [items, setItems] = useState<Pending[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const add = useCallback((files: File[]) => {
    const images = files.filter((file) => (MEDIA_MIME_TYPES as readonly string[]).includes(file.type));
    if (images.length < files.length) showToast("PNG · JPEG · WebP · GIF 그림만 붙일 수 있습니다.", "danger");
    const room = AGENT_ATTACHMENT_LIMIT - itemsRef.current.length;
    if (images.length > room) showToast(`그림은 한 번에 ${AGENT_ATTACHMENT_LIMIT}장까지 붙일 수 있습니다.`, "danger");
    for (const file of images.slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      setItems((current) => [...current, { key, name: file.name, mediaId: null, preview: URL.createObjectURL(file) }]);
      const form = new FormData();
      form.set("file", file);
      void uploadCareerMediaAction(form).then((result) => {
        const mediaId = mediaIdOf(result.url);
        if (!mediaId) { showToast(result.error ?? "그림을 올리지 못했습니다.", "danger"); setItems((current) => current.filter((item) => item.key !== key)); return; }
        setItems((current) => current.map((item) => (item.key === key ? { ...item, mediaId } : item)));
      });
    }
  }, []);
  const remove = useCallback((key: string) => setItems((current) => current.filter((item) => item.key !== key)), []);
  /** 보낼 첨부를 꺼내고 비운다. 아직 올리는 중인 그림이 있으면 null — 보내지 않는다. */
  const take = useCallback(() => {
    const current = itemsRef.current;
    if (current.some((item) => !item.mediaId)) return null;
    setItems([]);
    return current.map((item) => ({ mediaId: item.mediaId!, name: item.name.slice(0, 200) }));
  }, []);
  return useMemo(() => ({ items, add, remove, take, uploading: items.some((item) => !item.mediaId) }), [items, add, remove, take]);
}

export function AttachmentsProvider({ value, children }: { value: AttachmentsState; children: ReactNode }) {
  return <AttachmentsContext.Provider value={value}>{children}</AttachmentsContext.Provider>;
}

export function useAttachments() { return useContext(AttachmentsContext); }

/** 입력창 위의 그림 줄. 단추로 고르거나 입력창에 붙여 넣는다. */
export function ComposerAttachments({ disabled = false }: { disabled?: boolean }) {
  const state = useAttachments();
  const input = useRef<HTMLInputElement>(null);
  if (!state) return null;
  return <div className={styles.composerRow}>
    {state.items.map((item) => <span key={item.key} className={styles.chip} data-state={item.mediaId ? "ready" : "uploading"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 올리기 전 미리보기(blob:)라 이미지 최적화를 거치지 않는다. */}
      <img src={item.preview} alt="" />
      <span className={styles.chipName}>{item.mediaId ? item.name : "올리는 중"}</span>
      <button type="button" aria-label={`${item.name} 빼기`} onClick={() => state.remove(item.key)}><Icon name="x" size={11} /></button>
    </span>)}
    <button type="button" className={styles.attach} disabled={disabled || state.items.length >= AGENT_ATTACHMENT_LIMIT} onClick={() => input.current?.click()}>
      <Icon name="image" size={14} />화면 그림 붙이기
    </button>
    <input ref={input} type="file" accept={MEDIA_MIME_TYPES.join(",")} multiple hidden onChange={(event) => { state.add([...(event.target.files ?? [])]); event.target.value = ""; }} />
  </div>;
}

/** 보낸 말에 붙인 그림. 저장된 메시지의 attachments를 그대로 보인다. */
export function SentAttachments() {
  const attachments = useAuiState((s) => (s.message.metadata.custom as { attachments?: AgentAttachment[] } | undefined)?.attachments);
  if (!attachments?.length) return null;
  return <div className={styles.sent}>{attachments.map((item) => (
    // eslint-disable-next-line @next/next/no-img-element -- API가 내주는 사용자 그림이다.
    <img key={item.mediaId} src={mediaAssetUrl(API_BASE_URL, item.mediaId)} alt={item.name ?? "붙인 그림"} />
  ))}</div>;
}

/** 에이전트가 기록에 붙인 작업물. 찍은 사이트 · 붙인 그림은 그림으로, 레포는 이름과 요약으로 보인다. */
export function WorkMaterialsCard({ materials }: { materials: AgentWorkMaterials }) {
  return <div className={styles.card}>
    <p className={styles.cardHead}><Icon name="notebook" size={13} /><a href={`/career/records/${materials.recordId}`}>{materials.recordTitle}</a>에 붙였습니다</p>
    <ul className={styles.items}>{materials.items.map((item, index) => <li key={`${item.kind}:${index}`} data-kind={item.kind}>
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- API가 내주는 사용자 그림이다.
        <img src={mediaSrc(item.src)} alt={item.caption} />
      ) : <span className={styles.repoMark}><Icon name="github-logo" size={18} /></span>}
      <span className={styles.itemText}>
        <strong>{item.kind === "repo" ? item.url?.replace(/^https?:\/\/(www\.)?github\.com\//, "") : item.caption}</strong>
        {item.kind === "repo" ? <span>{item.caption}</span> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.kind === "repo" ? "저장소 열기" : "사이트 열기"}<Icon name="arrow-up-right" size={11} /></a> : null}
      </span>
    </li>)}</ul>
  </div>;
}
