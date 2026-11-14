"use client";

import { useActionState, useState } from "react";

import { updateDisplayNameAction, type DisplayNameState } from "@/app/account-actions";

import styles from "./page.module.css";

const INITIAL: DisplayNameState = {};

/**
 * 프로필의 표시 이름 줄. 보기 상태에서 「이름 바꾸기」를 누르면 입력칸으로 바뀐다.
 *
 * 저장이 끝나면 보기 상태로 돌아가고, 서버 액션이 레이아웃을 무효화해서 새 이름이 prop으로 내려온다.
 */
export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`${styles.dataRow} ${styles.verifyRow}`}>
      {editing ? (
        // 열 때마다 새로 세워 이전에 남은 오류가 다시 보이지 않게 한다.
        <DisplayNameEditor
          current={displayName}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.dataTitle}>{displayName}</div>
            <div className={styles.dataNote}>표시 이름</div>
          </div>
          <button type="button" className={styles.dataAction} onClick={() => setEditing(true)}>
            이름 바꾸기
          </button>
        </>
      )}
    </div>
  );
}

function DisplayNameEditor({ current, onDone }: { current: string; onDone: () => void }) {
  // 제어 입력칸이다. 서버 액션이 끝나면 React가 비제어 폼 필드를 처음 값으로 되돌려서,
  // 오류가 났을 때 사용자가 적던 이름이 사라진다.
  const [value, setValue] = useState(current);
  const [state, action, pending] = useActionState(
    async (previous: DisplayNameState, formData: FormData): Promise<DisplayNameState> => {
      const next = await updateDisplayNameAction(previous, formData);
      if (next.saved) onDone();
      return next;
    },
    INITIAL,
  );

  return (
    <form action={action} className={styles.nameForm}>
      <input
        name="displayName"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={200}
        autoFocus
        autoComplete="name"
        aria-label="표시 이름"
        aria-invalid={state.error ? true : undefined}
        className={`${styles.nameInput} ${state.error ? styles.nameInputInvalid : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
      />
      <div className={styles.dataActions}>
        <button type="submit" className={styles.dataAction} disabled={pending}>
          {pending ? "저장 중" : "저장"}
        </button>
        <button type="button" className={styles.dataAction} onClick={onDone} disabled={pending}>
          취소
        </button>
      </div>
      {state.error ? (
        <span className={`${styles.dataError} ${styles.nameError}`} role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
