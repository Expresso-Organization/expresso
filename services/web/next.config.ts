import type { NextConfig } from "next";

const config: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // contracts는 워크스페이스 소스를 그대로 쓴다 — 빌드 산출물을 기다리지 않는다.
  transpilePackages: ["@expresso/contracts"],
  // 아직 만들지 않은 화면으로 링크를 걸면 빌드에서 잡힌다.
  typedRoutes: true,
  experimental: {
    serverActions: {
      // 커리어 본문 그림은 서버 액션으로 올린다. 기본 1MB에서 막히지 않게 미디어 상한(MEDIA_MAX_BYTES 8MB)보다 조금 크게 둔다.
      // 근거: node_modules/next/dist/docs/01-app/02-guides/server-actions.md 「Body size limit」
      bodySizeLimit: "9mb",
    },
  },
};

export default config;
