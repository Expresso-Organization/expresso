"use client";

import type { RecipeV2JobPosting } from "@expresso/contracts";
import { useActionState, useEffect } from "react";

import { Icon } from "@/components/ui/Icon";

import { submitPostingAction, type PostingSubmitResult } from "./recipe-actions";
import styles from "./JobPostingPicker.module.css";

/**
 * 목록에 없는 공고를 원문으로 넣는다.
 *
 * 모아 둔 공고에서 고르는 일은 **실제 공고 탐색 화면**(`/jobs?pick=`)이 한다 —
 * 필터도 일치도도 마감도 거기 있고, 여기서 그것을 다시 만들면 두 벌이 갈린다.
 * 이 자리는 그 목록에 없는 공고를 위한 문 하나다.
 */
export function JobPostingPicker({
  current,
  onClose,
  onPick,
}: {
  current: RecipeV2JobPosting | null;
  onClose: () => void;
  onPick: (jobPostingId: string) => void;
}) {
  const [submitted, submitAction, submitting] = useActionState<PostingSubmitResult | null, FormData>(
    submitPostingAction,
    null,
  );

  useEffect(() => {
    if (submitted?.ok) onPick(submitted.jobPostingId);
  }, [submitted, onPick]);

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label="공고 붙여넣기">
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2>공고 붙여넣기</h2>
          <button type="button" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={15} />
          </button>
        </header>

        {current ? (
          <p className={styles.current}>
            지금 고른 공고 — <strong>{current.companyName} · {current.title}</strong>
          </p>
        ) : null}

        <form action={submitAction} className={styles.pasteForm}>
          <p className={styles.lede}>
            원문을 넣으면 공고와 요건 분석이 함께 생깁니다. 요건을 뽑는 일은 뒤에서
            돌아가고, 지원할 공고는 바로 이것으로 정해집니다.
          </p>
          <div className={styles.pasteRow}>
            <label>
              <span>회사 이름</span>
              <input name="companyName" maxLength={200} required placeholder="예: 토스" />
            </label>
            <label>
              <span>공고 제목</span>
              <input name="title" maxLength={300} required placeholder="예: 백엔드 엔지니어" />
            </label>
          </div>
          <label>
            <span>공고 주소 (선택)</span>
            <input name="sourceUrl" type="url" maxLength={2_000} placeholder="https://" />
          </label>
          <label>
            <span>공고 본문</span>
            <textarea
              name="descriptionRaw"
              rows={10}
              required
              placeholder="공고 원문을 그대로 붙여 넣어 주세요. 200자 이상이어야 요건을 뽑을 수 있습니다."
            />
          </label>
          {submitted && !submitted.ok ? <p className={styles.error} role="alert">{submitted.error}</p> : null}
          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "넣는 중" : "이 공고로 정하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
