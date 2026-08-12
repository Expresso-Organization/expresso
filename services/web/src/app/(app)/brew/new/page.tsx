import {
  SCREEN_DEFINITION_01_HTML,
  SCREEN_DEFINITION_01_SHA256,
} from "./screen-definition-01.generated";
import styles from "./page.module.css";

/**
 * 화면 정의서 01의 기준 화면.
 *
 * 여기서는 제품 컴포넌트로 재해석하지 않는다. 원본 HTML을 그대로 렌더링해
 * 이후 기능 연결과 동적 데이터 치환의 시각 기준점으로 사용한다.
 */
export default function NewBrewPage() {
  return (
    <div
      className={styles.canvas}
      data-screen-definition="01"
      data-source-sha256={SCREEN_DEFINITION_01_SHA256}
      dangerouslySetInnerHTML={{ __html: SCREEN_DEFINITION_01_HTML }}
    />
  );
}
