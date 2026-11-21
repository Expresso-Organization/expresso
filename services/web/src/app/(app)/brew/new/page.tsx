import { redirect } from "next/navigation";

/** 이전 「새 포트폴리오」 화면의 주소. 새 포트폴리오는 대화에서 시작하므로 그 대화로 보낸다. 저장해 둔 링크를 위해 남긴다. */
export default function NewBrewPage() {
  redirect("/home?new=portfolio");
}
