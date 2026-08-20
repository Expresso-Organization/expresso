/**
 * 소셜 왕복이 중간에 끊겼을 때 화면이 하는 말.
 *
 * §13 — 에러는 다음 행동으로 끝난다. 무엇이 잘못됐는지가 아니라 이제 무엇을
 * 하면 되는지를 적는다. 모르는 코드는 아무 말도 하지 않는다(주소창에 아무거나
 * 넣어 우리 화면에 문장을 띄우게 두지 않는다).
 */
const NOTICES: Record<string, string> = {
  google_unavailable:
    "지금은 Google로 들어올 수 없습니다. 이메일과 비밀번호로 로그인해 주세요.",
  google_expired:
    "로그인 요청이 만료됐습니다. Google 버튼을 다시 눌러 주세요.",
  google_failed:
    "Google 로그인을 끝내지 못했습니다. 다시 시도하거나 이메일로 로그인해 주세요.",
};

export function socialNotice(code: string | undefined): string | undefined {
  return code ? NOTICES[code] : undefined;
}
