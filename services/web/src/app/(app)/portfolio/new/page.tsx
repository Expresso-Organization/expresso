import { redirect } from "next/navigation";

/**
 * 이전 "새 포트폴리오" 주소.
 *
 * 제작은 설계서 2.1 이용 절차대로 공고 분석부터 시작한다. 공고를 고르거나 목표 없이
 * 시작하는 화면이 `/brew/new`이므로 이 주소는 그리로 보낸다. 저장해 둔 링크를 위해 남긴다.
 */
export default function NewPortfolioPage() {
  redirect("/brew/new");
}
