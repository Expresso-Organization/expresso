import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// 포털은 docs/ 를 빌드 없이 그대로 발행합니다. 그래서 빌드 결과를 docs/status/ 에 쓰고 커밋합니다.
// 같은 폴더의 status.json(판정 데이터)은 빌드가 건드리지 않습니다 — emptyOutDir 를 끄고,
// 낡은 자산은 build 스크립트가 docs/status/assets/ 만 지웁니다.
const outDir = resolve(import.meta.dirname, "../../../docs/status")

// 개발 서버에서도 화면이 발행본과 같은 ./status.json 을 읽게 합니다.
function statusData(): Plugin {
  return {
    name: "expresso-status-data",
    configureServer(server) {
      server.middlewares.use("/status.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.end(readFileSync(resolve(outDir, "status.json")))
      })
    },
  }
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), statusData()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir,
    emptyOutDir: false,
    assetsDir: "assets",
  },
  server: {
    // 토큰을 제품 웹(services/web/src/styles/tokens.css)에서 직접 읽습니다.
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
  },
})
