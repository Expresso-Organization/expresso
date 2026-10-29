import { expect, it } from "vitest";
import { claimContradictions } from "./claim-contradictions.js";
it("blocks converting a technology denial into implementation",()=>expect(claimContradictions("Java로 API를 개발했다.","Java 경험은 없다.")).not.toHaveLength(0));
it("preserves a negative statement",()=>expect(claimContradictions("Java 경험은 없다.","Java 경험은 없다.")).toEqual([]));
it("blocks transferring a teammate schema design",()=>expect(claimContradictions("데이터 구조를 직접 설계했다.","데이터 구조는 팀원이 정했다.")).not.toHaveLength(0));
it("allows an unrelated implementation",()=>expect(claimContradictions("Node.js로 조회 API를 개발했다.","데이터 구조는 팀원이 정했고 나는 Node.js로 API를 구현했다.")).toEqual([]));
it("does not broaden Java to JavaScript",()=>expect(claimContradictions("JavaScript로 API를 개발했다.","Java 경험은 없다.")).toEqual([]));
