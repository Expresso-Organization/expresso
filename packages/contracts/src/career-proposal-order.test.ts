import {expect,it} from "vitest";
import {compareCareerProposalOrder} from "./career-ai.js";
it("orders by creation instant then binary proposal ID, never updated status",()=>{
 const a={proposalId:"aaaaaaaa",createdAt:"2026-10-01T00:00:00.000Z"},b={proposalId:"bbbbbbbb",createdAt:"2026-10-02T00:00:00.000Z"};
 expect(compareCareerProposalOrder(a,b)).toBeLessThan(0);
 expect(compareCareerProposalOrder({...a,createdAt:b.createdAt},b)).toBeLessThan(0);
 expect(compareCareerProposalOrder(b,b)).toBe(0);
 expect(compareCareerProposalOrder({proposalId:"cccccccc"},b)).toBeLessThan(0);
 expect(compareCareerProposalOrder(b,{proposalId:"cccccccc"})).toBeGreaterThan(0);
});