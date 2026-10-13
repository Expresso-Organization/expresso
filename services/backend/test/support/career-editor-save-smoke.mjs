import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile,unlink} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

// 기존 제품 smoke를 그대로 보존하고 격리 fixture에 저장 회귀만 덧붙입니다.
assert.ok(process.env.B2_TEST_MONGO_URL && process.env.B2_TEST_REDIS_URL,"격리 Mongo·Redis URL을 명시해야 합니다");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../../..");
let source=await readFile(join(root,"services/backend/test/support/b2-web-product-smoke.mjs"),"utf8");
function replace(before,after){assert.ok(source.includes(before),"기존 smoke 실행 구조를 확인해야 합니다");source=source.replace(before,after);}
replace('resolve(dirname(fileURLToPath(import.meta.url)),"../../../..")',"resolve("+JSON.stringify(root)+")");
replace('await title.fill("UI exact source");','await title.fill("");await title.pressSequentially("UI exact source",{delay:60});await expect(title).toHaveValue("UI exact source");');
replace('await page.keyboard.type("Real UI body through document owner");','await page.keyboard.type("Real UI body through document owner",{delay:60});');
replace('currentStep="UI freeform tags registration and owner save";','const {probeCareerEditorSave}=await import("../test/support/career-editor-save-case.mjs");console.log(JSON.stringify(await probeCareerEditorSave({page,collections,userId,recordId:created.id,expect,api,bodyText:"Real UI body through document owner"})));currentStep="UI freeform tags registration and owner save";');
source=source.replaceAll('import("./b2-web-','import("../test/support/b2-web-');
const directory=join(root,"services/backend/var");await mkdir(directory,{recursive:true});
const generated=join(directory,"editor-save-"+randomUUID()+".mjs");
try {await writeFile(generated,source);await import(pathToFileURL(generated).href);} finally {await unlink(generated);}
