"use client";

import { MEDIA_FRAMES, MEDIA_MAX_BYTES, type MediaFrame } from "@expresso/contracts";
import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";

import { addMediaAction } from "./media-actions";
import styles from "./page.module.css";

/**
 * 04에 이미지를 놓는다.
 *
 * 04에는 지금까지 **블록을 새로 만드는 길이 없었다** — 복제와 삭제뿐이었다.
 * 문장은 추출이 만들어 주지만 화면 캡처와 로고는 사용자가 가져오는 것이라,
 * 그 자리가 없으면 지면에 그림이 영영 들어가지 않는다.
 *
 * 액자를 고르게 하는 이유는 캡처 때문이다. 제품 화면은 **액자가 있어야 제품으로
 * 보인다** — 그 액자는 렌더러가 그리므로 목업 도구가 필요 없다.
 */

const FRAME_LABEL: Record<MediaFrame, string> = {
  none: "그대로",
  browser: "브라우저 창",
  phone: "폰",
};

export function MediaDrop({
  portfolioId,
  sectionId,
  sectionTitle,
}: {
  portfolioId: string;
  sectionId: string;
  sectionTitle: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [frame, setFrame] = useState<MediaFrame>("none");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function place(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MEDIA_MAX_BYTES) {
      setError(`한 장은 ${Math.floor(MEDIA_MAX_BYTES / 1024 / 1024)}MB까지입니다.`);
      return;
    }
    // 서버 액션에 파일을 그대로 넘긴다 — 브라우저가 알아서 본문에 싣는다.
    const body = new FormData();
    body.set("portfolioId", portfolioId);
    body.set("sectionId", sectionId);
    body.set("frame", frame);
    body.set("alt", alt.trim());
    body.set("file", file);
    start(async () => {
      const result = await addMediaAction(body);
      if (result.error) setError(result.error);
      else {
        setAlt("");
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className={styles.mediaDrop}>
      <div className={styles.mediaHead}>
        <Icon name="image" size={13} color="var(--ex-slate-500)" />
        <span className={styles.mediaTitle}>{sectionTitle}에 이미지 놓기</span>
      </div>

      <div className={styles.mediaFrames} role="group" aria-label="액자">
        {MEDIA_FRAMES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={frame === option}
            className={frame === option ? styles.mediaFrameOn : styles.mediaFrame}
            onClick={() => setFrame(option)}
          >
            {FRAME_LABEL[option]}
          </button>
        ))}
      </div>

      {/* 대체 텍스트는 그림이 안 뜰 때 남는 글이고, 화면 낭독기가 읽는 글이다. */}
      <input
        type="text"
        value={alt}
        onChange={(event) => setAlt(event.target.value)}
        placeholder="무엇이 보이는지 (대체 텍스트)"
        className={styles.mediaAlt}
        maxLength={200}
      />

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className={styles.mediaFile}
        disabled={pending}
        onChange={(event) => place(event.target.files?.[0])}
      />

      <p className={styles.mediaNote}>
        {pending ? "올리는 중…" : "PNG · JPEG · WebP · GIF · 8MB까지"}
      </p>
      {error ? <p className={styles.mediaError}>{error}</p> : null}
    </div>
  );
}
