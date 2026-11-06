"use client";

import type { DummyAccount } from "@expresso/contracts";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { endImpersonationAction, impersonateAction, manageDummyAction, type DummyActionState } from "@/app/admin-actions";
import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

const INITIAL: DummyActionState = {};

/** 되돌릴 수 없는 두 동작. 누르면 줄이 확인으로 바뀐다. */
const CONFIRM = {
  refill: { label: "다시 채우기", pending: "채우는 중" },
  remove: { label: "지우기", pending: "지우는 중" },
} as const;

function Submit({ intent, label, pending, tone }: { intent?: string; label: string; pending: string; tone?: "primary" | "danger" }) {
  const status = useFormStatus();
  const busy = status.pending && (intent === undefined || status.data?.get("intent") === intent);
  return (
    <button
      type="submit"
      name={intent ? "intent" : undefined}
      value={intent}
      disabled={status.pending}
      className={`${styles.action} ${tone === "primary" ? styles.actionPrimary : tone === "danger" ? styles.actionDanger : ""}`}
    >
      {busy ? pending : label}
    </button>
  );
}

/**
 * 관리 화면의 더미 계정 한 줄.
 *
 * 계정이 없으면 줄이 비어 보이고 「만들기」 하나만 선다. 있으면 「이 계정으로 보기」가 앞에 서고,
 * 되돌릴 수 없는 다시 채우기 · 지우기는 아이콘 버튼으로 물러나 있다가 누르면 줄 아래에서 한 번 되묻는다. 지금 보고 있는 계정의 줄은 강조되고
 * 앞 버튼이 「관리자로 돌아가기」로 바뀐다.
 */
export function DummyRow({ dummy, volume, acting, lastImpersonation }: {
  dummy: DummyAccount;
  /** 가장 많은 인물을 1로 둔 기록 양. 막대 길이다. */
  volume: number;
  acting: boolean;
  lastImpersonation: { at: string; by: string | null } | null;
}) {
  const [asking, setAsking] = useState<keyof typeof CONFIRM | null>(null);
  const [state, action] = useActionState(async (previous: DummyActionState, formData: FormData) => {
    const next = await manageDummyAction(previous, formData);
    if (!next.error) setAsking(null);
    return next;
  }, INITIAL);
  const account = dummy.account;
  const count = account?.recordCount ?? dummy.sourceRecordCount;

  return (
    <div className={`${styles.row} ${account ? "" : styles.rowEmpty} ${acting ? styles.rowActing : ""}`}>
      <span className={styles.avatar}>{dummy.displayName.slice(0, 1)}</span>
      <div className={styles.who}>
        <div className={styles.name}>{dummy.displayName}</div>
        <div className={styles.headline}>{dummy.headline}</div>
        <div className={styles.email}>{dummy.email}</div>
      </div>

      <div className={styles.volume}>
        <span className={styles.count}>{count}<span className={styles.countUnit}>건</span></span>
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${Math.max(volume * 100, 2)}%` }} />
        </span>
      </div>

      {lastImpersonation ? (
        <div className={styles.last}>
          <Icon name="user-switch" size={13} />
          <span>{lastImpersonation.at}</span>
          {lastImpersonation.by ? <span className={styles.lastBy}>{lastImpersonation.by}</span> : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        {!account ? (
          <form action={action}>
            <input type="hidden" name="key" value={dummy.key} />
            <Submit intent="create" label="만들기" pending="만드는 중" tone="primary" />
          </form>
        ) : (
          <>
            {acting ? (
              <form action={endImpersonationAction}>
                <Submit label="관리자로 돌아가기" pending="돌아가는 중" tone="primary" />
              </form>
            ) : (
              <form action={impersonateAction}>
                <input type="hidden" name="key" value={dummy.key} />
                <Submit label="이 계정으로 보기" pending="여는 중" tone="primary" />
              </form>
            )}
            <button
              type="button"
              className={`${styles.iconAction} ${asking === "refill" ? styles.iconActionOn : ""}`}
              aria-label="다시 채우기"
              title="다시 채우기"
              aria-pressed={asking === "refill"}
              onClick={() => setAsking(asking === "refill" ? null : "refill")}
            >
              <Icon name="arrow-counter-clockwise" size={15} />
            </button>
            <button
              type="button"
              className={`${styles.iconAction} ${styles.iconActionDanger} ${asking === "remove" ? styles.iconActionOn : ""}`}
              aria-label="지우기"
              title="지우기"
              aria-pressed={asking === "remove"}
              onClick={() => setAsking(asking === "remove" ? null : "remove")}
            >
              <Icon name="trash" size={15} />
            </button>
          </>
        )}
      </div>

      {account && asking ? (
        <form action={action} className={styles.confirm}>
          <input type="hidden" name="key" value={dummy.key} />
          <p className={styles.warning} role="alert">
            주의: 남겨 둘 포트폴리오가 없는지 먼저 확인하세요. 이 계정의 기록과 포트폴리오가 모두 지워지고 되돌릴 수 없습니다.
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.action} onClick={() => setAsking(null)}>그만두기</button>
            <Submit intent={asking} label={CONFIRM[asking].label} pending={CONFIRM[asking].pending} tone="danger" />
          </div>
        </form>
      ) : null}
      {state.error ? <div className={styles.error} role="alert">{state.error}</div> : null}
    </div>
  );
}
