/**
 * 커리어 서랍 7종의 아이콘(§3.5). 고정 매핑이고 다른 아이콘으로 대체하지 않는다. 사이드바 · 커리어 화면 ·
 * 생성 기다림 화면이 이 표 하나를 쓴다.
 *
 * 서랍에 저장된 아이콘 이름(`categoryIcon`)은 이 웹이 쓰는 아이콘 묶음(Phosphor)의 이름과 다를 수 있어,
 * 화면은 서랍 키로 고른다.
 */
export const CAREER_CATEGORY_ICONS: Record<string, string> = {
  experience: "chat-circle-dots",
  project: "briefcase",
  education_history: "graduation-cap",
  certification_award: "certificate",
  academic_writing: "article",
  activity_leadership: "users-three",
  skill_tool: "code",
};
