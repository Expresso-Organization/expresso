import { Icon } from "@/components/ui/Icon";

import styles from "./auth.module.css";

/**
 * 화면 정의서 10의 "소셜 우선" 두 줄.
 *
 * 아이콘은 정의서의 `google-chrome-logo`(크롬) 대신 `google-logo`(Google의 G)를
 * 쓴다. 로그인시키는 주체는 브라우저가 아니라 Google 계정이고, Google의 브랜드
 * 지침도 이 자리에 G를 요구한다. 정의서 쪽을 고쳐야 하는 자리다.
 *
 * `googleEnabled`가 거짓이면 눌리지 않는다. 클라이언트 ID와 시크릿이 없으면
 * 눌러도 되돌아올 뿐인데, 그런 버튼을 켜 두지 않는다.
 *
 * 정의서 10b(회원가입)에는 GitHub만 있다. 그런데 Google로 처음 들어오면 계정이
 * 그 자리에서 만들어진다 — 로그인 화면이 가입까지 하는데 가입 화면에서 그 길을
 * 가릴 이유가 없다. 여기서도 열고 라벨만 바꾼다.
 */
export function SocialSignIn({
  googleEnabled,
  verb = "계속",
}: {
  googleEnabled: boolean;
  verb?: "계속" | "가입";
}) {
  return (
    <div className={styles.socials}>
      {/* GitHub은 백엔드에 경로가 아직 없다. */}
      <button type="button" className={styles.social} disabled>
        <Icon name="github-logo" weight="fill" size={16} />
        GitHub으로 {verb}
      </button>

      {googleEnabled ? (
        // 앱을 떠나는 이동이라 링크다. 라우트 핸들러가 Google로 넘긴다.
        <a href="/api/auth/google/start" className={styles.social}>
          <Icon name="google-logo" weight="fill" size={16} />
          Google로 {verb}
        </a>
      ) : (
        <button type="button" className={styles.social} disabled>
          <Icon name="google-logo" weight="fill" size={16} />
          Google로 {verb}
        </button>
      )}
    </div>
  );
}
