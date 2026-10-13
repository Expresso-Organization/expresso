import assert from "node:assert/strict";

// 격리된 실제 Web·Fastify·Spring·Mongo fixture에서만 호출하는 저장 회귀입니다.
export async function probeCareerEditorSave({page,collections,userId,recordId,expect,api,bodyText}) {
 const before=await collections.careerRecords.findOne({_id:recordId,userId});
 await expect(page.getByRole("status",{name:"본문 저장 상태",exact:true})).toHaveText("저장됨");
 await page.getByRole("button",{name:"닫기",exact:true}).click();
 await page.reload();
 const row=page.getByRole("row").filter({has:page.getByText(before.title,{exact:true})}).first();
 await row.getByRole("gridcell").nth(1).click();
 let editor=page.getByLabel("커리어 기록 본문");await expect(editor).toContainText(bodyText);
 const title=page.getByRole("textbox",{name:"제목",exact:true});
 await title.focus();await title.press("End");await title.pressSequentially(" typed",{delay:60});
 await expect(title).toHaveValue(before.title+" typed");
 await title.press("ControlOrMeta+A");await title.pressSequentially(before.title,{delay:60});
 await expect(title).toHaveValue(before.title);
 await editor.click();await page.keyboard.press("ControlOrMeta+A");
 await page.keyboard.type("Reopened document saved2",{delay:60});
 await expect(page.getByRole("status",{name:"본문 저장 상태",exact:true})).toHaveText("저장됨");
 await expect.poll(async()=>JSON.stringify((await api("GET","/v1/career/records/"+recordId+"/document")).json.document)).toContain("Reopened document saved2");
 assert.equal((await collections.careerRecords.findOne({_id:recordId,userId})).version,before.version);
 const sockets=[];page.on("websocket",socket=>{if(new URL(socket.url()).pathname === "/v1/career/records/"+recordId+"/session")sockets.push(socket);});
 await page.reload();await row.getByRole("gridcell").nth(1).click();
 editor=page.getByLabel("커리어 기록 본문");await expect(editor).toContainText("Reopened document saved2");
 await expect(page.getByRole("status",{name:"본문 저장 상태",exact:true})).toHaveText("저장됨");
 assert.equal(sockets.length,1,"재열기 중 기록별 WebSocket은 하나여야 합니다");
 const frames=[],received=[];sockets[0].on("framesent",({payload})=>{try{frames.push(JSON.parse(String(payload)));}catch{}});
 sockets[0].on("framereceived",({payload})=>{try{received.push(JSON.parse(String(payload)));}catch{}});
 await editor.click();await page.keyboard.press("ControlOrMeta+A");await page.keyboard.insertText(bodyText);
 await expect(page.getByRole("status",{name:"본문 저장 상태",exact:true})).toHaveText("저장됨");
 await expect.poll(async()=>JSON.stringify((await api("GET","/v1/career/records/"+recordId+"/document")).json.document)).toContain(bodyText);
 const edits=frames.filter(frame=>frame.type==="update");assert.ok(edits.length>0);
 assert.equal(new Set(edits.map(frame=>frame.clientSequence)).size,edits.length,"ack 대기 중 같은 update 재전송 금지");
 const persisted=await collections.careerRecords.findOne({_id:recordId,userId});
 assert.equal(persisted.version,before.version);
 await expect.poll(()=>received.filter(frame=>frame.type==="ack" && frame.recordId===recordId && frame.documentVersion===persisted.documentVersion).length).toBeGreaterThan(0);
 return {check:"real title draft, body reopen/reload, WS unique updates, saved acknowledgement and Mongo readback",pass:true,updates:edits.length,acks:received.filter(frame=>frame.type==="ack").length,documentVersion:persisted.documentVersion,sockets:sockets.length};
}
