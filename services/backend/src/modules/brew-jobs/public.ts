

/**
 * 잡 하나가 실제로 하는 일. 결과의 식별자를 돌려준다.
 *
 * `jobId`를 함께 준다 — 만들어지는 동안을 흘려보내는 통로의 열쇠가 이것이다
 * (`RecipeStream`). 결과의 id는 다 끝나야 생기는데 화면은 그 전부터 열려 있다.
 */
export interface BrewJobRunner {
  run(input: { userId: string; brewId: string; jobId: string; idempotencyKey: string }): Promise<string>;
}

export class BrewJobError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "BrewJobError";
    this.statusCode = statusCode;
  }
}

/** 잡이 실패한 이유. 다시 눌러도 되는지가 여기서 갈린다. */
export interface FailureClassifier {
  (error: unknown): { code: string; retryable: boolean };
}
