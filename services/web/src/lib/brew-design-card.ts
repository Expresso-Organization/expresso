import { UuidSchema } from "@expresso/contracts";
import { z } from "zod";

/**
 * 대화의 「디자인」 카드가 디자인 대화 말고 더 읽는 것. 디자이너의 첫 말은 구성(레시피)의 섹션과 근거를 읽어 쓰므로 구성이 먼저다.
 * 「이 스타일로 만들기」는 구성 ID와 이번 달 한도를 본다.
 */
export const BrewDesignCardSchema = z.strictObject({
  recipeId: UuidSchema.nullable(),
  /** 구성 잡이 줄에 있거나 도는 중이다. */
  recipeBuilding: z.boolean(),
  /** 구성 잡이 실패했고 구성이 없을 때 보일 문장. */
  recipeFailure: z.string().min(1).max(500).nullable(),
  /** 이번 달에 새로 만들 수 있는가. */
  generationAllowed: z.boolean(),
  /** 생성이 줄에 있거나 도는 중이다. 만든 뒤에는 생성 화면으로 잇는다. */
  generating: z.boolean(),
});
export type BrewDesignCardData = z.infer<typeof BrewDesignCardSchema>;
export const BrewDesignCardResponseSchema = z.strictObject({ data: BrewDesignCardSchema });
