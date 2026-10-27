"use client";

import { useActionState, useState } from "react";

import { requestDeletionAction, type DeletionState } from "@/app/account-actions";

import styles from "./page.module.css";

const INITIAL: DeletionState = {};

/**
 * 09 데이터 관리 — 내보내기와 계정 삭제 요청.
 *
 * 삭제는 한 번 되묻는다. 요청하면 로그아웃되고 취소 화면(`/login/restore`)에서 취소
 * 코드를 한 번 보여 준다. 30일 안에 그 코드로 되돌린다.
 */
export function DataSection() {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(requestDeletionAction, INITIAL);

  return (
    <>
      <div className={styles.dataRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.dataTitle}>내 데이터 내보내기</div>
          <div className={styles.dataNote}>기록 · 포트폴리오 전체를 JSON 파일로 받습니다</div>
        </div>
        <a href="/account/export" download className={styles.dataAction}>
          내보내기
        </a>
      </div>
      <div className={styles.dataRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`${styles.dataTitle} ${styles.dataTitleDanger}`}>계정 삭제 요청</div>
          <div className={styles.dataNote}>
            {asking
              ? "요청하면 바로 로그인이 끊기고 공개 중인 포트폴리오가 닫힙니다. 30일 뒤 모두 지웁니다."
              : "30일 뒤 완전 삭제 · 그 전까지 취소 코드로 되돌릴 수 있습니다"}
          </div>
          {state.error ? <div className={styles.dataError} role="alert">{state.error}</div> : null}
        </div>
        {asking ? (
          <form action={action} className={styles.dataActions}>
            <input type="hidden" name="confirm" value="yes" />
            <button type="button" className={styles.dataAction} onClick={() => setAsking(false)} disabled={pending}>
              그만두기
            </button>
            <button type="submit" className={`${styles.dataAction} ${styles.dataActionDanger}`} disabled={pending}>
              {pending ? "요청하는 중" : "삭제 요청하기"}
            </button>
          </form>
        ) : (
          <button type="button" className={`${styles.dataAction} ${styles.dataActionDanger}`} onClick={() => setAsking(true)}>
            삭제 요청
          </button>
        )}
      </div>
    </>
  );
}
