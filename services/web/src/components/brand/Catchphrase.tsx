import styles from "./Catchphrase.module.css";

/**
 * 브랜드 캐치프레이즈 — **Express your work. / idea. / self.**
 *
 * 디자인 시스템 헤더의 그 문장이고, 마크업과 값을 그대로 옮겼다.
 *
 * 모션은 세 조각이 맞물린다.
 *
 * - `ex-roll` — 굴림통 안의 네 줄이 96px씩 올라간다.
 * - `ex-your` — `your`가 오른쪽으로 9px 밀리며 시그니처 색이 된다.
 * - `ex-merge` — **굴림통이** 왼쪽으로 9px 당겨진다.
 *
 * 뒤의 둘이 서로 반대로 움직이는 것이 핵심이다. 단어가 바뀌는 순간 `your`와
 * 그 단어가 서로에게 다가갔다 제자리로 돌아간다. 한쪽에만 붙이면 그냥 옆으로
 * 미끄러지고, 그건 다른 모션이다.
 *
 * 마지막 `work.`는 첫 단어를 한 번 더 둔 것이다 — 끝에서 처음으로 돌아올 때
 * 되감기는 것처럼 보이지 않게 한다.
 */
const WORDS = ["work.", "idea.", "self.", "work."] as const;

export function Catchphrase({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div className={`${styles.line} ${tone === "dark" ? styles.dark : styles.light}`}>
      <span className={styles.lead}>
        Express <span className={`${styles.your} ex-anim-your`}>your</span>
      </span>
      {/* 굴림은 눈에만 있는 것이다. 읽는 기계에는 아래 한 줄로 준다. */}
      <div className={`${styles.roller} ex-anim-merge`} aria-hidden="true">
        <div className={`${styles.stack} ex-anim-roll`}>
          {WORDS.map((word, index) => (
            <div key={`${word}-${index}`} className={styles.word}>
              {word}
            </div>
          ))}
        </div>
      </div>
      <span className="ex-sr-only">work. idea. self.</span>
    </div>
  );
}
