"use client";

import {
  PageStyleGrammarSchema,
  pagePreviewDocument,
  partialFields,
  renderableHtml,
  type PageStyleGrammar,
} from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./LivePreview.module.css";

/**
 * 만들어지는 지면을 그 자리에서 보여준다.
 *
 * **`srcDoc`을 갈아 끼우지 않는다.** 조각이 올 때마다 문서를 통째로 바꾸면
 * 브라우저가 매번 처음부터 다시 그린다 — 폰트가 다시 뜨고, 읽던 자리가 맨
 * 위로 튀고, 화면이 깜빡인다. 대신 열어 둔 문서에 **이어 쓴다.** 브라우저가
 * 원래 HTML을 받아 그리는 방식 그대로라 안 닫힌 `<section>`도 알아서 열어 둔
 * 채 그리고, 다음 조각이 오면 그만큼 자란다.
 *
 * 스크립트는 어디서도 돌지 않는다. 지금 흐르는 것은 **아직 소독을 안 지난**
 * 모델 출력이라 `sandbox`에 스크립트 권한을 주지 않고, 문서 쪽에도
 * `pagePreviewDocument`가 CSP를 건다. 저장될 때 `sanitizePage`가 한 번 더 본다.
 *
 * 아직 아무것도 안 왔으면 `children`을 그대로 둔다 — 프로바이더가 조각을 못
 * 내면(codex) 그 화면이 끝까지 남는다. 진행률을 지어내지 않는다.
 *
 * 붙는 대상은 **생성 잡**이다. 이 화면이 열릴 때 포트폴리오는 아직 없다 —
 * 워커가 문장과 배치를 다 쓴 뒤에야 생기고, 그때까지 1~2분이 지난다.
 */
export function LivePreview({
  jobId,
  title,
  children,
}: {
  jobId: string;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  /** 이번 판에 이미 써 넣은 길이. 조각은 **여기서부터** 이어 쓴다. */
  const written = useRef(0);
  const opened = useRef(false);
  const [buffer, setBuffer] = useState("");
  const [grammar, setGrammar] = useState<PageStyleGrammar | null>(null);
  const [live, setLive] = useState(false);
  /**
   * 어느 단계인가.
   *
   * 실측에서 첫 조각까지 126초였다. 그 사이 화면이 정직하게 말할 수 있는 것은
   * **무슨 일이 일어나는 중인가** 하나다 — 얼마나 남았는지는 우리도 모르고,
   * 모델도 알려 주지 않는다.
   *
   * `thinking`은 분량만 실려 온다(모델이 내용을 안 준다). 숫자를 보여 주는
   * 대신 단계를 가르는 데 쓴다 — 그게 오는 동안은 구상 중이고, 조각이 오기
   * 시작하면 쓰는 중이다.
   */
  const [stage, setStage] = useState<"waiting" | "thinking">("waiting");

  useEffect(() => {
    const source = new EventSource(`/api/generation-jobs/${jobId}/page-stream`);

    const restart = () => {
      // 끊겼다 다시 붙으면 서버가 처음부터 다시 보낸다. 받는 쪽도 처음으로.
      written.current = 0;
      opened.current = false;
      setBuffer("");
      setLive(false);
      setStage("waiting");
    };

    source.addEventListener("open", restart);
    source.addEventListener("begin", (event) => {
      // `style`은 문법을 JSON으로 적은 **글자**다. 문법이 없으면 `"null"`이 온다.
      const { style } = JSON.parse((event as MessageEvent<string>).data) as { style: string };
      const parsed = PageStyleGrammarSchema.safeParse(JSON.parse(style));
      setGrammar(parsed.success ? parsed.data : null);
    });
    // 값은 쌓인 분량이지만 화면은 그 숫자를 쓰지 않는다 — 있다는 사실만 쓴다.
    source.addEventListener("thinking", () => setStage("thinking"));
    source.addEventListener("delta", (event) => {
      const { text } = JSON.parse((event as MessageEvent<string>).data) as { text: string };
      setBuffer((current) => current + text);
      setLive(true);
    });
    source.addEventListener("done", () => {
      source.close();
      // 이제 진짜가 있다. 서버가 다시 그리면 이 화면은 사라진다.
      router.refresh();
    });
    source.addEventListener("failed", () => {
      source.close();
      router.refresh();
    });

    return () => source.close();
  }, [jobId, router]);

  /*
   * 조각을 문서에 붙인다.
   *
   * 순서가 중요하다 — 문서를 열 때 껍데기(서체 · 리셋 · 키트)를 먼저 깔아야
   * **첫 문단부터 제 모습**이다. 키트는 문법이 정한 변수를 먹고 도는데 그
   * 문법은 `begin`으로 먼저 와 있다.
   */
  useEffect(() => {
    const document_ = frame.current?.contentDocument;
    if (!document_) return;
    const fields = partialFields(buffer);
    const html = renderableHtml(fields.html ?? "");

    if (!opened.current) {
      if (!html) return;
      const shell = pagePreviewDocument({
        html: "",
        css: "",
        title,
        ...(grammar ? { grammar } : {}),
      });
      // `pageDocument`가 `<body>`를 쥐고 있다. 그 앞까지가 껍데기고 뒤는 우리가 채운다.
      document_.open();
      document_.write(`${shell.slice(0, shell.indexOf("<body>"))}<body>`);
      opened.current = true;
    }

    if (html.length > written.current) {
      document_.write(html.slice(written.current));
      written.current = html.length;
      // 쓰이는 자리를 따라간다 — 다 쓰고 나서 위로 올리는 것은 사람이 한다.
      document_.documentElement.scrollTop = document_.documentElement.scrollHeight;
    }

    /*
     * 모델이 쓴 CSS는 **맨 뒤에 온다**(`html` → `css` → `rationale` 순서).
     * 그동안 지면을 세워 주는 것은 키트다. 여기 오는 것은 그 위에 얹는 것이라
     * 늦게 와도 무너지지 않고, 올 때마다 통째로 갈아 끼우면 된다.
     */
    if (fields.css) {
      const id = "ex-live-css";
      const style = document_.getElementById(id)
        ?? document_.head.appendChild(Object.assign(document_.createElement("style"), { id }));
      if (style.textContent !== fields.css) style.textContent = fields.css;
    }
  }, [buffer, grammar, title]);

  return (
    <div className={styles.wrap}>
      <div className={live ? styles.cardHidden : styles.card}>
        {children}
        {stage === "thinking" ? <p className={styles.thought}>지면을 구상하는 중</p> : null}
      </div>
      <div className={live ? styles.stage : styles.stageHidden} aria-hidden={!live}>
        <div className={styles.bar}>
          <span className={styles.dot} />
          <span>지면을 쓰는 중</span>
        </div>
        <iframe
          ref={frame}
          className={styles.frame}
          title={`${title} 미리보기`}
          /*
           * 스크립트 권한이 없다 — 이 안에서는 어떤 코드도 돌지 않는다.
           * `allow-same-origin`은 우리가 이어 쓰기 위해 필요하고, 그것 없이는
           * 오리진이 익명이 되어 CSP의 `img-src 'self'`가 우리 그림까지 막는다.
           */
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
