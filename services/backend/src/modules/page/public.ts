

/**
 * 자유 생성 지면의 살림.
 *
 * 하는 일은 셋이다 — 재료를 모아 생성기에 넘기고, 나온 것을 **판(revision)으로**
 * 쌓고, 꺼내 준다.
 *
 * 판을 쌓는 것이 이 경로의 되돌리기다. 블록을 고칠 수 없으니 마음에 안 들면
 * 다시 뽑는 수밖에 없고, 그러면 **직전 것이 남아 있어야 한다** — 다시 뽑은 게
 * 더 나쁠 때 돌아갈 곳이 없으면 사용자는 생성 버튼을 누르기를 두려워한다.
 */

export class PageServiceError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PageServiceError";
    this.statusCode = statusCode;
  }
}
