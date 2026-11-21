/** 보관 · 보관 해제. 성공하면 참. 사이드바 목록은 레이아웃이 세션에서 읽으므로 부른 쪽이 `router.refresh()`를 한다. */
export async function setCategoryArchived(categoryId: string, archived: boolean): Promise<boolean> {
  const response = await fetch(`/api/career/categories/${categoryId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived }) }).catch(() => null);
  return Boolean(response?.ok);
}
