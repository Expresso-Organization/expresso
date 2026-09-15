import { LegalDocument } from "../LegalDocument";
import styles from "../legal.module.css";

export const metadata = { title: "개인정보 처리방침 · Expresso" };

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="개인정보 처리방침"
      sections={[
        { heading: "1. 수집하는 항목", body: <p className={styles.body}>이메일, 이름, 비밀번호(해시로만 보관), Google 로그인 시 Google 계정 식별자. 이용자가 직접 적는 커리어 기록.</p> },
        { heading: "2. 이용 목적", body: <p className={styles.body}>계정 식별과 로그인, 비밀번호 재설정과 이메일 인증 메일 발송, 포트폴리오 제작과 배포.</p> },
        { heading: "3. 보관 기간", body: <p className={styles.body}>계정이 있는 동안 보관하고, 삭제 요청 뒤 유예 기간이 지나면 지웁니다. 로그인 세션은 마지막 활동 뒤 최대 30일, 발급 뒤 90일을 넘기지 않습니다.</p> },
        { heading: "4. 처리 위탁", body: <p className={styles.body}>인증 메일 발송은 Resend를 통해 이루어지며, 수신자 주소와 메일 본문이 전달됩니다.</p> },
        { heading: "5. 이용자의 권리", body: <p className={styles.body}>이용자는 자신의 데이터를 내려받고, 동의를 철회하고, 계정 삭제를 요청할 수 있습니다.</p> },
      ]}
    />
  );
}
