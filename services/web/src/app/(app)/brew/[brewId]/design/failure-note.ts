/** 구성 · 생성이 실패했을 때 디자인 단계가 보이는 문장. 디자인 화면과 에이전트 대화의 「디자인」 카드가 함께 쓴다. */
export function failureNote(code: string | null, isFreeBrew: boolean): string {
  if (code === "BREW_INPUT_REJECTED") {
    return isFreeBrew
      ? "입력한 내용으로 구성을 만들지 못했습니다. 자유 생성 설명을 보완한 뒤 다시 만들어 주세요."
      : "고른 재료가 세 건보다 적어 구성을 만들지 못했습니다. 기록을 더 고른 뒤 다시 만들어 주세요.";
  }
  return code ? `지난 생성이 실패했습니다(${code}). 다시 만들 수 있습니다.` : "지난 생성이 실패했습니다. 다시 만들 수 있습니다.";
}
