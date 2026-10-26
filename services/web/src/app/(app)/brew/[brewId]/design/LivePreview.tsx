"use client";

import {
  PageStreamBlueprintSchema,
  PageStreamFillSchema,
  PageStreamStageSchema,
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
 *
 * **설계가 먼저 오는 생성**은 문서를 이어 쓰지 않는다. 설계가 끝나면 최종 지면과 같은 구조의 청사진(`blueprint`)이
 * 한 번 오고, 이후 `fill`은 그 문서의 글 자리(`data-slot`) 글만 바꾼다. 블록의 글 자리가 다 차면 그 블록에
 * 디자인이 입혀진다(CSS만으로, `BLUEPRINT_CSS`). 완성본은 `delta`로 오고, 문서를 다시 열지 않고 본문만 바꾼다 —
 * 서체를 다시 받지 않고 읽던 자리도 그대로다.
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
  /** 설계가 먼저 오는 생성의 단계. 청사진이 오기 전에는 `null`이다. */
  const [phase, setPhase] = useState<"filling" | "filled" | "rendered" | "final" | null>(null);
  /** 청사진을 연 문서인가. 그러면 `delta`는 이어 쓰기가 아니라 완성본으로 바꿔 끼우는 것이다. */
  const blueprintOpen = useRef(false);
  /** 사람이 지면을 직접 움직였는가. 그 뒤로는 쓰이는 자리를 따라 내려가지 않는다. */
  const userMoved = useRef(false);
  const grammarRef = useRef<PageStyleGrammar | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    const source = new EventSource(`/api/generation-jobs/${jobId}/page-stream`);

    const restart = () => {
      // 끊겼다 다시 붙으면 서버가 처음부터 다시 보낸다. 받는 쪽도 처음으로.
      written.current = 0;
      opened.current = false;
      blueprintOpen.current = false;
      userMoved.current = false;
      setBuffer("");
      setLive(false);
      setStage("waiting");
      setPhase(null);
    };

    source.addEventListener("open", restart);
    source.addEventListener("begin", (event) => {
      // `style`은 문법을 JSON으로 적은 **글자**다. 문법이 없으면 `"null"`이 온다.
      const { style } = JSON.parse((event as MessageEvent<string>).data) as { style: string };
      const parsed = PageStyleGrammarSchema.safeParse(JSON.parse(style));
      setGrammar(parsed.success ? parsed.data : null);
      grammarRef.current = parsed.success ? parsed.data : null;
    });
    source.addEventListener("blueprint", (event) => {
      const page = PageStreamBlueprintSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      const document_ = frame.current?.contentDocument;
      if (!page.success || !document_) return;
      const shell = pagePreviewDocument({
        html: "",
        css: "",
        title: titleRef.current,
        ...(grammarRef.current ? { grammar: grammarRef.current } : {}),
      });
      document_.open();
      document_.write(`${shell.slice(0, shell.indexOf("<body>"))}<body>${page.data.html}`);
      document_.close();
      writeCss(document_, page.data.css);
      document_.documentElement.dataset.stage = "blueprint";
      for (const name of ["wheel", "touchstart", "keydown"])
        document_.addEventListener(name, () => { userMoved.current = true; }, { passive: true });
      blueprintOpen.current = true;
      setPhase("filling");
      setLive(true);
    });
    source.addEventListener("fill", (event) => {
      const fill = PageStreamFillSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      const document_ = frame.current?.contentDocument;
      if (!fill.success || !document_ || !blueprintOpen.current) return;
      const { path, text, done } = fill.data;
      // 아직 한 글자도 안 왔으면 자리 표시를 그대로 둔다.
      if (!text && !done) return;
      for (const slot of document_.querySelectorAll<HTMLElement>(`[data-slot="${CSS.escape(path)}"]`)) {
        const starting = slot.dataset.slotState === "empty";
        slot.textContent = text;
        // 공급자가 출력을 처음부터 다시 쓰면 다 쓴 칸에도 글이 다시 온다. 그 칸은 글만 바꾸고 끝난 상태로 둔다 —
        // 되돌리면 디자인을 입은 블록이 다시 청사진으로 깜빡인다.
        if (slot.dataset.slotState !== "done") slot.dataset.slotState = done ? "done" : "writing";
        if (starting && !userMoved.current) follow(document_, slot);
      }
    });
    source.addEventListener("stage", (event) => {
      const stage_ = PageStreamStageSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      const document_ = frame.current?.contentDocument;
      if (!stage_.success || !document_ || !blueprintOpen.current) return;
      if (stage_.data.name === "designed") return;
      // 다 채웠다. 모델이 비워 둔 칸의 자리 표시를 걷어 남은 블록에도 디자인을 입힌다.
      for (const slot of document_.querySelectorAll<HTMLElement>('[data-slot-state]:not([data-slot-state="done"])')) {
        if (slot.dataset.slotState === "empty") slot.textContent = "";
        slot.dataset.slotState = "done";
      }
      setPhase(stage_.data.name);
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

    // 청사진을 연 문서에는 완성본이 한 덩어리로 온다. 본문과 CSS만 바꾸고 청사진 단계를 끝낸다.
    if (blueprintOpen.current) {
      if (fields.html === undefined || fields.css === undefined) return;
      document_.body.innerHTML = fields.html;
      writeCss(document_, fields.css);
      delete document_.documentElement.dataset.stage;
      setPhase("final");
      return;
    }

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
    if (fields.css) writeCss(document_, fields.css);
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
          <span>{phase ? PHASE_LABELS[phase] : "지면을 쓰는 중"}</span>
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

/** 설계가 먼저 오는 생성에서 지금 일어나는 일. 청사진이 뜬 뒤로는 모델 호출이 채우기 하나뿐이다. */
const PHASE_LABELS = {
  filling: "설계한 자리에 내용을 채우는 중",
  filled: "디자인을 입히는 중",
  rendered: "완성한 지면을 점검하는 중",
  final: "초안을 저장하는 중",
} as const;

/** 지면 CSS를 한 자리에 둔다. 올 때마다 통째로 갈아 끼운다. */
function writeCss(document_: Document, css: string) {
  const id = "ex-live-css";
  const style = document_.getElementById(id)
    ?? document_.head.appendChild(Object.assign(document_.createElement("style"), { id }));
  if (style.textContent !== css) style.textContent = css;
}

/**
 * 쓰기 시작한 자리가 화면 밖이면 지면 안에서만 그 자리를 가운데로 옮긴다. `scrollIntoView`는 iframe 바깥의
 * 앱 화면까지 함께 움직여 쓰지 않는다.
 */
function follow(document_: Document, slot: HTMLElement) {
  const view = document_.defaultView;
  if (!view) return;
  const rect = slot.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= view.innerHeight) return;
  view.scrollTo({ top: view.scrollY + rect.top - (view.innerHeight - rect.height) / 2, behavior: "smooth" });
}
