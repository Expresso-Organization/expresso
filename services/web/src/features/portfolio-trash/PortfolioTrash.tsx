"use client";

import type { TrashedBrew, TrashedPortfolio } from "@expresso/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Icon } from "@/components/ui/Icon";
import { AnchoredMenu } from "@/features/career-editor/views/AnchoredMenu";
import viewStyles from "@/features/career-editor/views/views.module.css";

import styles from "./portfolio-trash.module.css";
import { loadTrashAction, restoreAction, trashAction, type TrashKind } from "./trash-actions";

const DAY_MS = 86_400_000;

/**
 * 창의 틀. 공용 `@/components/ui/dialog`는 위치 · 배경을 Tailwind 유틸리티로 잡는데, 그 CSS는 지면 · 에이전트 채팅을
 * 그리는 화면에서만 불린다. 홈에서는 창이 화면 아래에 흘러 붙으므로 같은 base-ui 원시 요소에 이 모듈의 스타일을 쓴다.
 */
function Frame({ open, onOpenChange, title, children }: { open: boolean; onOpenChange(open: boolean): void; title: ReactNode; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className={styles.backdrop} />
      <DialogPrimitive.Popup className={styles.dialog}>
        <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

/** 휴지통으로 옮길 대상. 포트폴리오면 지금 공개 중인지 함께 받는다. */
export interface TrashTarget {
  kind: TrashKind;
  id: string;
  title: string;
  published?: boolean;
}

/**
 * 옮기기 전 확인 창. 보관 기간 30일과 그 뒤 함께 지워지는 것을 알린다(기능 명세 T9.1.4 — 방문 데이터 처리 안내).
 * 제목은 사용자가 쓴 말이라 조사를 붙이지 않고 본문 첫 줄에 따로 보인다.
 */
export function TrashConfirm({ target, busy, error, onConfirm, onCancel }: { target: TrashTarget; busy: boolean; error: string | null; onConfirm(): void; onCancel(): void }) {
  const question = target.kind === "portfolio" ? "이 포트폴리오를 휴지통으로 옮길까요?" : "만들던 포트폴리오를 휴지통으로 옮길까요?";
  const purged = target.kind === "portfolio" ? "지면 · 배포 기록 · 방문 데이터" : "답변 · 레시피";
  return <Frame open onOpenChange={(next) => { if (!next && !busy) onCancel(); }} title={<><Icon name="trash" size={16} />{question}</>}>
      <DialogPrimitive.Description className={styles.text} render={<div />}>
        <strong>{target.title}</strong>
        {target.published ? <p data-tone="warning">공개 주소가 바로 닫힙니다. 되살려도 다시 배포해야 열립니다.</p> : null}
        <p>30일 동안 휴지통에서 되살릴 수 있습니다. 그 뒤에는 {purged}가 함께 지워집니다.</p>
      </DialogPrimitive.Description>
      {error ? <p role="alert" className={styles.issue}>{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onCancel}>취소</button>
        <button type="button" data-danger="true" disabled={busy} onClick={onConfirm}><Icon name="trash" size={13} />휴지통으로 옮기기</button>
      </div>
  </Frame>;
}

/** 「…」 메뉴 → 확인 창 → 휴지통. 옮긴 뒤 할 일(목록 새로 그리기 · 홈으로 가기)은 부르는 쪽이 정한다. */
function useTrashFlow(target: TrashTarget, afterTrash: () => void) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const confirm = () => startTransition(async () => {
    const result = await trashAction(target.kind, target.id);
    if (result.error) { setError(result.error); return; }
    setConfirming(false);
    afterTrash();
  });
  const dialog = confirming ? <TrashConfirm target={target} busy={busy} error={error} onConfirm={confirm} onCancel={() => { setConfirming(false); setError(null); }} /> : null;
  return { open: () => { setError(null); setConfirming(true); }, dialog };
}

function TrashMenu({ label, className, onTrash }: { label: string; className: string | undefined; onTrash(): void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchorRef} type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Icon name="dots-three" size={16} /></button>
    {open ? <AnchoredMenu anchorRef={anchorRef} label={label} onClose={() => setOpen(false)}>
      <div className={viewStyles.tabMenuSection}>
        <button type="button" role="menuitem" data-danger="true" onClick={() => { setOpen(false); onTrash(); }}><Icon name="trash" size={14} /><span>휴지통으로 옮기기</span></button>
      </div>
    </AnchoredMenu> : null}
  </>;
}

/**
 * 홈 「내 포트폴리오」 카드에 「…」를 붙인다. 카드 전체가 링크라 메뉴 단추를 링크 안에 둘 수 없어,
 * 카드를 감싸고 단추를 링크의 형제로 세운다.
 */
export function TrashableCard({ target, children }: { target: TrashTarget; children: ReactNode }) {
  const router = useRouter();
  const flow = useTrashFlow(target, () => router.refresh());
  return <div className={styles.cardHost}>
    {children}
    <TrashMenu label={`${target.title} 메뉴`} className={styles.cardMenu} onTrash={flow.open} />
    {flow.dialog}
  </div>;
}

/** 포트폴리오 편집 화면 도구 막대의 「…」. 옮기면 홈으로 간다 — 이 편집 주소는 이제 열리지 않는다. */
export function EditorTrashMenu({ target, className }: { target: TrashTarget; className: string | undefined }) {
  const router = useRouter();
  const flow = useTrashFlow(target, () => router.push("/home" as Route));
  return <>
    <TrashMenu label="포트폴리오 메뉴" className={className} onTrash={flow.open} />
    {flow.dialog}
  </>;
}

/** 영구 삭제까지 남은 날. 지운 직후는 보관 기간 30일이 그대로 보이도록 올림한다. */
function daysLeft(purgeAfter: string, now: number): number {
  return Math.max(1, Math.ceil((new Date(purgeAfter).getTime() - now) / DAY_MS));
}

function localDate(timestamp: string): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join(".");
}

type TrashRow = { kind: TrashKind; id: string; title: string; deletedAt: string; purgeAfter: string };

function rows(portfolios: TrashedPortfolio[], brews: TrashedBrew[]): TrashRow[] {
  return [
    ...portfolios.map((item) => ({ kind: "portfolio" as const, id: item.id, title: item.title, deletedAt: item.deletedAt, purgeAfter: item.purgeAfter })),
    ...brews.map((item) => ({ kind: "brew" as const, id: item.id, title: item.title ?? "만들던 포트폴리오", deletedAt: item.deletedAt, purgeAfter: item.purgeAfter })),
  ].sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

/** 「내 포트폴리오」 머리의 「휴지통」과 그 창. 되살리면 목록에서 빠지고 홈 격자에 다시 선다. */
export function PortfolioTrashButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TrashRow[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setIssue("");
    void loadTrashAction().then((result) => {
      if (cancelled) return;
      if ("error" in result) { setIssue(result.error); setItems([]); return; }
      setItems(rows(result.portfolios, result.brews));
      setLoadedAt(Date.now());
    });
    return () => { cancelled = true; };
  }, [open]);

  async function restore(item: TrashRow) {
    setBusy(item.id);
    const result = await restoreAction(item.kind, item.id);
    setBusy(null);
    if (result.error) { setIssue(result.error); return; }
    setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? null);
    router.refresh();
  }

  return <>
    <button type="button" className={styles.trashButton} onClick={() => setOpen(true)}><Icon name="trash" size={14} />휴지통</button>
    <Frame open={open} onOpenChange={setOpen} title={<><Icon name="trash" size={16} />포트폴리오 휴지통<DialogPrimitive.Close className={styles.close} aria-label="닫기"><Icon name="x" size={15} /></DialogPrimitive.Close></>}>
        {issue ? <p role="alert" className={styles.issue}>{issue}</p> : null}
        {items === null ? <p className={styles.empty} aria-busy="true">불러오는 중</p>
          : items.length === 0 ? <p className={styles.empty}>비어 있습니다.</p>
            : <ul className={styles.list} aria-label="지운 포트폴리오">
              {items.map((item) => <li key={item.id}>
                <span className={styles.row}>
                  <strong>{item.title}</strong>
                  <small>{item.kind === "brew" ? "만들던 포트폴리오 · " : ""}{localDate(item.deletedAt)} 삭제 · {daysLeft(item.purgeAfter, loadedAt)}일 뒤 영구 삭제</small>
                </span>
                <button type="button" disabled={busy === item.id} onClick={() => void restore(item)}><Icon name="arrow-counter-clockwise" size={13} />복원</button>
              </li>)}
            </ul>}
    </Frame>
  </>;
}
