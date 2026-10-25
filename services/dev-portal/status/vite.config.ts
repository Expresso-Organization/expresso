import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// 포털은 docs/ 를 빌드 없이 그대로 발행합니다. 그래서 빌드 결과를 docs/status/ 에 쓰고 커밋합니다.
// 같은 폴더의 data/(로컬 스캔 결과)는 빌드가 건드리지 않습니다 — emptyOutDir 를 끄고,
// 낡은 자산은 build 스크립트가 docs/status/assets/ 만 지웁니다.
const outDir = resolve(import.meta.dirname, "../../../docs/status")

// 개발 서버에서도 발행본처럼 ./data/*.json(스캐너 결과)을 docs/status/data/ 에서 읽게 한다.
function statusData(): Plugin {
  return {
    name: "expresso-status-data",
    configureServer(server) {
      server.middlewares.use("/data", (req, res) => {
        const name = (req.url ?? "").replace(/^\//, "").split("?")[0]
        const file = resolve(outDir, "data", name)
        if (!/^[a-z-]+\.json$/.test(name) || !existsSync(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.end(readFileSync(file))
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
