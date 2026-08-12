import type { Consent, ConsentScope } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { consents } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { grantConsentAction } from "../../../consent-actions";
import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";

/**
 * 10d 직전 — 무엇을 어디로 보내는지 묻는다.
 *
 * 이력서를 올리기 **전에** 묻는다. 올린 뒤에 묻는 것은 묻는 것이 아니다.
 *
 * 두 가지를 따로 묻는다. 공고 원문은 남이 쓴 공개된 글이고 커리어 기록은 내가
 * 쓴 글이라, 하나만 주고 다른 하나는 안 줄 수 있어야 한다. 아무것도 고르지
 * 않고 넘어가도 된다 — 그때는 AI 기능이 잠기고 설정에서 나중에 켠다.
 */

const SCOPES: {
  scope: ConsentScope;
  icon: string;
  title: string;
  what: string;
  why: string;
}[] = [
  {
    scope: "job_posting_analysis",
    icon: "target",
    title: "공고를 읽어 요건을 뽑습니다",
    what: "붙여 넣은 채용 공고의 원문이 AI 모델로 갑니다.",
    why: "공고가 무엇을 요구하는지 알아야 내 기록과 맞춰 볼 수 있습니다.",
  },
  {
    scope: "career_records",
    icon: "file-text",
    title: "내 기록으로 포트폴리오를 만듭니다",
    what: "내가 쓴 커리어 기록과 대화 답변이 AI 모델로 갑니다.",
    why: "질문을 고르고 문장과 지면을 만드는 데 쓰입니다. 이게 없으면 제작이 돌지 않습니다.",
  },
];

export default async function OnboardingConsentPage() {
  const session = await requireSession();
  const { data } = await consents.list(session.accessToken);
  const byScope = new Map(data.consents.map((consent) => [consent.scope, consent]));

  return (
    <OnboardingShell
      step={2}
      footLeft={
        <Link href={"/onboarding/goal" as Route} className={styles.ghost}>
          이전
        </Link>
      }
      footRight={
        <button type="submit" form="consent" className={styles.primary}>
          동의하고 계속
        </button>
      }
    >
      <div className={styles.stepLabelMono}>STEP 2 / 4</div>
      <h1 className={styles.title}>무엇을 보내는지 먼저 말씀드립니다</h1>
      <p className={styles.lede}>
        Expresso는 AI 모델을 씁니다. 무엇이 이 서비스 밖으로 나가는지 아셔야
        합니다. 지금 고르지 않으셔도 되고, 나중에 설정에서 켜거나 끌 수 있습니다.
      </p>

      <form action={grantConsentAction} id="consent" className={styles.consentList}>
        <input type="hidden" name="policyVersion" value={data.policyVersion} />
        <input type="hidden" name="next" value="/onboarding/materials" />

        {SCOPES.map((item) => {
          const state = byScope.get(item.scope);
          return (
            <label key={item.scope} className={styles.consentCard}>
              <input
                type="checkbox"
                name={item.scope}
                defaultChecked={state?.granted ?? false}
                className={styles.consentBox}
              />
              <span className={styles.consentBody}>
                <span className={styles.consentTitle}>
                  <Icon name={item.icon} size={14} color="var(--ex-espresso)" />
                  {item.title}
                  {state ? <Status consent={state} /> : null}
                </span>
                <span className={styles.consentWhat}>{item.what}</span>
                <span className={styles.consentWhy}>{item.why}</span>
              </span>
            </label>
          );
        })}
      </form>

      <div className={styles.consentFoot}>
        <Icon name="lock-simple" size={12} />
        <span>
          보낸 글은 <b>모델 학습에 쓰이지 않습니다.</b> 동의는 언제든 설정에서 끌
          수 있고, 끄면 그때부터 아무것도 보내지 않습니다. 이미 만들어진
          포트폴리오는 그대로 남습니다.
        </span>
      </div>
    </OnboardingShell>
  );
}

/** 지금 상태. 끈 것과 우리가 문구를 바꾼 것을 구분해 말한다. */
function Status({ consent }: { consent: Consent }) {
  if (consent.needsRenewal) {
    return <span className={styles.consentRenew}>문구가 바뀌어 다시 여쭙니다</span>;
  }
  if (consent.granted) return <span className={styles.consentOn}>동의함</span>;
  if (consent.revokedAt) return <span className={styles.consentOff}>껐음</span>;
  return null;
}
