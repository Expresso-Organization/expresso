import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // contracts는 워크스페이스 소스를 그대로 쓴다 — 빌드 산출물을 기다리지 않는다.
  transpilePackages: ["@expresso/contracts"],
  // 아직 만들지 않은 화면으로 링크를 걸면 빌드에서 잡힌다.
  typedRoutes: true,
};

export default config;
