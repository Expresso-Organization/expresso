"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./WizardShell.module.css";

export interface TitleEditState {
  /** §13 — 에러는 다음 행동으로 끝난다. */
  error: string | null;
}

/**
 * 제작 머리말의 고칠 수 있는 제목 칩.
 *
 * 연필을 누르면 칩 자리에 입력칸이 서고, Enter나 「저장」이 `action`을 부른다.
 * 무엇을 어디에 저장하는지는 모른다 — 부르는 쪽이 제작 ID를 묶은 서버 액션을
 * 넘긴다. 저장이 끝나면 서버가 화면을 다시 그려 새 `title`이 들어온다.
 */
export function WizardTitleEditor({
  title,
  placeholder,
  action,
}: {
  title: string | null;
  /** 이름이 아직 없을 때 칩에 서는 말. */
  placeholder: string;
  action: (state: TitleEditState, formData: FormData) => Promise<TitleEditState>;
}) {
  const [editing, setEditing] = useState(false);
  // 에러는 이번 편집에만 속한다. 취소했다가 다시 열면 지난 실패를 다시 보이지 않는다.
  const [error, setError] = useState<string | null>(null);
  const [, formAction, pending] = useActionState(
    async (previous: TitleEditState, formData: FormData) => {
      const next = await action(previous, formData);
      setError(next.error);
      if (!next.error) setEditing(false);
      return next;
    },
    { error: null },
  );
  const close = () => {
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={styles.titleChip}
        onClick={() => setEditing(true)}
        aria-label={`이름 바꾸기: ${title ?? placeholder}`}
      >
        <span className={`${styles.titleChipText} ${title ? "" : styles.titleChipEmpty}`}>
          {title ?? placeholder}
        </span>
        <Icon name="pencil-simple" size={11} color="var(--ex-fg-subtle)" />
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.titleForm}>
      <input
        name="title"
        defaultValue={title ?? ""}
        placeholder={placeholder}
        maxLength={300}
        required
        autoFocus
        aria-label="포트폴리오 이름"
        className={styles.titleInput}
        // 이름은 대개 통째로 바꾼다. 열리면 전부 골라 둔다.
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      />
      <button type="submit" className={styles.titleSave} disabled={pending}>
        {pending ? "저장하는 중" : "저장"}
      </button>
      <button type="button" className={styles.titleCancel} onClick={close}>
        취소
      </button>
      {error && !pending ? (
        <span role="alert" className={styles.titleError}>
          {error}
        </span>
      ) : null}
    </form>
  );
}
