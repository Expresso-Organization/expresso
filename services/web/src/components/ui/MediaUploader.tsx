"use client";

import { useRef, useState, type DragEvent } from "react";

import { Icon } from "./Icon";
import styles from "./MediaUploader.module.css";

/**
 * 파일 하나를 받는 자리.
 *
 * 누르거나 끌어다 놓는다. 무엇을 받는지(`accept` · `maxBytes`)와 받은 뒤 무엇을
 * 할지(`onFile`)는 화면이 정한다 — 여기는 파일이 어디로 가는지 모른다.
 * `onFile`이 문구를 돌려주면 그것이 실패 이유다.
 */
export function MediaUploader({
  accept,
  maxBytes,
  onFile,
  label = "이미지 올리기",
  note,
  compact = false,
  disabled = false,
}: {
  accept: readonly string[];
  maxBytes: number;
  onFile: (file: File) => Promise<string | null>;
  label?: string;
  note?: string;
  /** 목록 위에 한 줄로 서는 작은 모양. */
  compact?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take(file: File | undefined) {
    setError(null);
    if (!file || pending) return;
    if (!accept.includes(file.type)) {
      setError("받지 않는 형식입니다.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`한 장은 ${Math.floor(maxBytes / 1024 / 1024)}MB까지입니다.`);
      return;
    }
    setPending(true);
    const failure = await onFile(file);
    setPending(false);
    if (failure) setError(failure);
    if (input.current) input.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOver(false);
    void take(event.dataTransfer.files[0]);
  }

  return (
    <div className={styles.uploader} data-compact={compact ? "1" : undefined}>
      <button
        type="button"
        className={styles.zone}
        data-over={over ? "1" : undefined}
        disabled={disabled || pending}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name={pending ? "circle-notch" : "upload-simple"} size={compact ? 14 : 18} />
        <span className={styles.label}>{pending ? "올리는 중…" : label}</span>
        {note && !compact ? <span className={styles.note}>{note}</span> : null}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept.join(",")}
        className={styles.input}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void take(event.target.files?.[0])}
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
