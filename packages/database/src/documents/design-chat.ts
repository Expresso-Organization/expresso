import type { DesignChat } from "@expresso/contracts";

import type { JsonObject } from "./common.js";

/**
 * 디자인을 정하는 대화 한 건. 제작(brew)마다 하나다.
 *
 * `head`는 여는 호출이 출처에서 뽑은, 첫 화면에 실을 사실이다. 화면에는 보내지 않고 첫 화면을 그리는 호출이 읽는다.
 * `heartbeatAt`은 답을 만드는 동안 1초마다 갱신한다. 멎은 지 오래된 실행은 읽을 때 끊긴 것으로 바꾼다.
 */
export type DesignChatDoc = Omit<DesignChat, "id"> & { _id: string; userId: string; head: JsonObject | null; createdAt: string; heartbeatAt: Date };
