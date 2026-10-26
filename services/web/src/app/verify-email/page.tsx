import { EmailVerificationTokenSchema } from "@expresso/contracts";

import { StandaloneNotice } from "@/components/shell/StandaloneNotice";
import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

/**
 * 인증 메일의 링크. 로그인 없이 열린다 — 다른 브라우저에서 눌러도 확인은 끝난다.
 *
 * 결과는 세 가지다. 확인됨 · 링크가 죽었음(만료 · 사용됨 · 형식 아님). 이미 인증된
 * 계정의 옛 링크는 백엔드가 성공으로 답하므로 여기서 따로 가르지 않는다.
 */
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const parsed = EmailVerificationTokenSchema.safeParse(token);
  const signedIn = Boolean(await readAccessToken());
  const back = signedIn
    ? ({ href: "/home", label: "홈으로" } as const)
    : ({ href: "/login", label: "로그인" } as const);

  if (!parsed.success) return <Dead back={back} />;

  try {
    const { data } = await auth.confirmEmailVerification({ token: parsed.data });
    return (
      <StandaloneNotice
        title="이메일을 확인했습니다"
        body={`${data.email}은(는) 이제 확인된 주소입니다. 포트폴리오를 공개 주소에 올릴 수 있습니다.`}
        backHref={back.href}
        backLabel={back.label}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return <Dead back={back} />;
    throw error;
  }
}

function Dead({ back }: { back: { href: "/home" | "/login"; label: string } }) {
  return (
    <StandaloneNotice
      title="이 링크는 더 쓸 수 없습니다"
      body="24시간이 지났거나 이미 쓰인 링크입니다. 앱 위쪽의 안내에서 인증 메일을 다시 받으십시오."
      backHref={back.href}
      backLabel={back.label}
    />
  );
}
