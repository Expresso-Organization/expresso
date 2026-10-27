import type { NextConfig } from "next";

const config: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // contracts는 워크스페이스 소스를 그대로 쓴다 — 빌드 산출물을 기다리지 않는다.
  transpilePackages: ["@expresso/contracts"],
  // 아직 만들지 않은 화면으로 링크를 걸면 빌드에서 잡힌다.
  typedRoutes: true,
  // 장면 런타임은 불투명 출처(sandbox, allow-same-origin 없음)인 지면 문서가 모듈 스크립트로 받습니다.
  // 모듈 스크립트는 CORS로 받으므로 출처 null에도 열어 둡니다.
  async headers() {
    return [
      {
        source: "/scene-runtime/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default config;
