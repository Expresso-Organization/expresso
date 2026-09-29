import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultPlan,compilePlan} from './catalog.mjs';
import {validateModelSpec} from './model-spec.mjs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const content=JSON.parse(fs.readFileSync(new URL('../samples/fresh-service-designer/content.json',import.meta.url)));
const known=compilePlan(defaultPlan(content,'gallery','showcase'),content).spec;

test('모델 Spec의 컴포넌트 선택과 데이터 바인딩을 검증해 렌더 상태로 연결한다',()=>{
 const result=validateModelSpec(known,content);
 assert.equal(result.plan.recipe,'gallery');
 assert.equal(result.plan.cases.length,3);
 assert.equal(result.state.projects.length,3);
});

test('모델이 허용하지 않은 경로와 콘텐츠 누락을 출력하면 거부한다',()=>{
 const binding=structuredClone(known);
 binding.elements.intro.props.profile={$state:'/private-record'};
 assert.throws(()=>validateModelSpec(binding,content));
 const missing=structuredClone(known);
 missing.elements.page.children=missing.elements.page.children.filter(id=>id!=='case-threadlab');
 assert.throws(()=>validateModelSpec(missing,content));
 const invented=structuredClone(known);
 invented.elements.work.type='ArbitraryHtml';
 assert.throws(()=>validateModelSpec(invented,content));
});

test('모델이 직접 만든 Spec이 저장 HTML의 출처이며 섹션 순서를 결정한다',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
 const folder=path.join(root,'docs/library/previews/portfolio/runs/model-spec-service-designer');
 const read=name=>JSON.parse(fs.readFileSync(path.join(folder,name)));
 const manifest=read('run.json'),output=read('composition.json'),attempts=read('model-attempts.json');
 assert.equal(manifest.specOrigin,'model');
 assert.deepEqual(manifest.validationAttempts.map(item=>item.valid),[true]);
 assert.deepEqual(JSON.parse(attempts.attempts[0].output),output.spec);
 assert.equal(validateModelSpec(output.spec,output.content).plan.recipe,'gallery');
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(folder,'index.html'))).digest('hex'),manifest.htmlSha256);
 assert.ok(output.spec.elements.page.children.indexOf('career')<output.spec.elements.page.children.indexOf('evidence'));
 assert.ok(compilePlan(output.plan,output.content).spec.elements.page.children.indexOf('career')>compilePlan(output.plan,output.content).spec.elements.page.children.indexOf('evidence'));
});
