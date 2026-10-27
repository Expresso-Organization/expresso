import { LegalDocument } from "../LegalDocument";
import styles from "../legal.module.css";

export const metadata = { title: "이용약관 · Expresso" };

export default function TermsPage() {
  return (
    <LegalDocument
      title="이용약관"
      sections={[
        { heading: "1. 서비스", body: <p className={styles.body}>Expresso는 커리어 기록을 모아 채용 공고에 맞는 포트폴리오를 만들고 공개 주소에 배포하는 서비스입니다.</p> },
        { heading: "2. 계정", body: <p className={styles.body}>계정은 본인이 관리하는 이메일 또는 Google 계정으로 만듭니다. 비밀번호와 로그인 상태는 이용자가 관리합니다.</p> },
        { heading: "3. 이용자의 콘텐츠", body: <p className={styles.body}>이용자가 적은 기록과 만든 포트폴리오의 권리는 이용자에게 있습니다. 서비스는 포트폴리오를 만들고 배포하는 데 필요한 범위에서만 이를 처리합니다.</p> },
        { heading: "4. AI 처리", body: <p className={styles.body}>기록과 공고 원문을 AI 모델로 보내는 일은 별도 동의(설정 › 동의)로 범위를 나눠 받습니다. 동의를 끄면 해당 처리를 하지 않습니다.</p> },
        { heading: "5. 계정 삭제", body: <p className={styles.body}>이용자는 언제든 계정 삭제를 요청할 수 있고, 유예 기간이 지나면 데이터가 지워집니다.</p> },
      ]}
    />
  );
}
