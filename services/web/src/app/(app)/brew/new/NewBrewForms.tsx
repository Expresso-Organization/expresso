"use client";

import { useActionState } from "react";

import {
  createFreeBrewAction,
  pasteAndAnalyzeAction,
  readUrlAction,
  type NewBrewState,
  type UrlReadState,
} from "./new-brew-actions";
import styles from "./page.module.css";

const EMPTY: NewBrewState = { error: null };
const EMPTY_URL: UrlReadState = { error: null, read: null };

export function PastePostingForm() {
  const [state, action, pending] = useActionState(pasteAndAnalyzeAction, EMPTY);
  return (
    <PostingFields
      action={action}
      pending={pending}
      error={state.error}
      heading="공고 원문으로 시작하기"
      note="회사와 역할을 적고 공고 본문을 붙여 넣어 주세요. 요건을 정리한 뒤 사용할 기록을 고를 수 있습니다."
    />
  );
}

export function CompanyUrlForm() {
  const [read, readAction, reading] = useActionState(readUrlAction, EMPTY_URL);
  const [submitted, submitAction, submitting] = useActionState(pasteAndAnalyzeAction, EMPTY);

  return (
    <div className={styles.formStack}>
      <section className={styles.formCard}>
        <div className={styles.formIntro}>
          <h2 className={styles.formTitle}>채용 공고 주소 읽기</h2>
          <p className={styles.formNote}>공고가 열린 주소를 넣으면 내용을 읽어 아래 편집 칸에 채웁니다.</p>
        </div>
        <form action={readAction} className={styles.urlRow}>
          <label className={styles.srOnly} htmlFor="posting-url">채용 공고 주소</label>
          <input id="posting-url" className={styles.input} type="url" name="url" placeholder="https://company.com/jobs/..." required />
          <button className={styles.secondaryButton} type="submit" disabled={reading}>
            {reading ? "읽는 중…" : "주소 읽기"}
          </button>
        </form>
        {read.error ? <p className={styles.formError}>{read.error}</p> : null}
      </section>

      {read.read ? (
        <PostingFields
          key={read.read.sourceUrl}
          action={submitAction}
          pending={submitting}
          error={submitted.error}
          heading="읽어 온 내용 확인하기"
          note="자동으로 읽은 내용은 틀릴 수 있습니다. 고친 뒤 제작을 시작해 주세요."
          initial={read.read}
        />
      ) : (
        <p className={styles.helper}>주소를 읽지 못하면 ‘공고 내용 붙여넣기’에서 바로 시작할 수 있습니다.</p>
      )}
    </div>
  );
}

export function FreeBrewForm() {
  const [state, action, pending] = useActionState(createFreeBrewAction, EMPTY);
  return (
    <section className={styles.formCard}>
      <div className={styles.formIntro}>
        <h2 className={styles.formTitle}>원하는 포트폴리오를 자유롭게 설명해 주세요</h2>
        <p className={styles.formNote}>
          공고와 기록이 없어도 시작할 수 있습니다. 생성된 HTML은 편집기에서 직접 고치고, 필요한 수정은 AI에게 요청할 수 있습니다.
        </p>
      </div>
      <form action={action} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>포트폴리오 제목</span>
          <input className={styles.input} name="title" maxLength={300} placeholder="예: 제품 디자이너 김민재 포트폴리오" required />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>담고 싶은 내용과 분위기</span>
          <textarea
            className={styles.textarea}
            name="brief"
            maxLength={20000}
            rows={10}
            placeholder="소개, 보여 주고 싶은 프로젝트, 맡았던 역할, 성과, 원하는 구성과 시각 분위기를 자유롭게 적어 주세요. 완성된 문장일 필요는 없습니다."
            required
          />
        </label>
        <LengthField />
        {state.error ? <p className={styles.formError}>{state.error}</p> : null}
        <button className={styles.primaryButton} type="submit" disabled={pending}>
          {pending ? "제작을 여는 중…" : "이 내용으로 시작"}
        </button>
      </form>
    </section>
  );
}

function PostingFields({
  action,
  pending,
  error,
  heading,
  note,
  initial,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  heading: string;
  note: string;
  initial?: { companyName: string; title: string; descriptionRaw: string; sourceUrl: string };
}) {
  return (
    <section className={styles.formCard}>
      <div className={styles.formIntro}>
        <h2 className={styles.formTitle}>{heading}</h2>
        <p className={styles.formNote}>{note}</p>
      </div>
      <form action={action} className={styles.form}>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.label}>회사</span>
            <input className={styles.input} name="companyName" defaultValue={initial?.companyName} maxLength={200} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>공고 제목</span>
            <input className={styles.input} name="title" defaultValue={initial?.title} maxLength={300} required />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>공고 주소 <span className={styles.optional}>선택</span></span>
          <input className={styles.input} type="url" name="sourceUrl" defaultValue={initial?.sourceUrl} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>공고 원문</span>
          <textarea className={styles.textarea} name="descriptionRaw" defaultValue={initial?.descriptionRaw} rows={12} minLength={200} required />
          <span className={styles.fieldHint}>요건을 읽을 수 있도록 200자 이상 붙여 넣어 주세요.</span>
        </label>
        <LengthField />
        {error ? <p className={styles.formError}>{error}</p> : null}
        <button className={styles.primaryButton} type="submit" disabled={pending}>
          {pending ? "공고를 정리하는 중…" : "공고 분석 시작"}
        </button>
      </form>
    </section>
  );
}

function LengthField() {
  return (
    <fieldset className={styles.lengthField}>
      <legend className={styles.label}>예상 분량</legend>
      <div className={styles.lengthOptions}>
        {[
          ["single", "간결하게", "핵심만 한 화면"],
          ["double", "보통", "프로젝트를 충분히"],
          ["triple", "자세하게", "맥락과 과정까지"],
        ].map(([value, label, hint], index) => (
          <label className={styles.lengthOption} key={value}>
            <input type="radio" name="lengthPreset" value={value} defaultChecked={index === 1} />
            <span><strong>{label}</strong><small>{hint}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
