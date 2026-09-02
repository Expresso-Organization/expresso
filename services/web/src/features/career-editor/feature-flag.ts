/** 운영 환경에서는 문자열 true만 v2를 연다. 누락·오타·false는 기존 화면을 유지한다. */
export function careerEditorV2Enabled(value = process.env.CAREER_EDITOR_V2_ENABLED): boolean {
  return value === "true";
}
