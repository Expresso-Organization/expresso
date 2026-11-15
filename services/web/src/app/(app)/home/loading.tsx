import { AppBody } from "@/components/shell/AppShell";

import { HomeHeader } from "./HomeChrome";

/** 홈이 세션을 기다리는 동안. 헤더는 기다리지 않아도 그릴 수 있으므로 진짜로 그린다. */
export default function Loading() {
  return (
    <>
      <HomeHeader />
      <AppBody>{null}</AppBody>
    </>
  );
}
