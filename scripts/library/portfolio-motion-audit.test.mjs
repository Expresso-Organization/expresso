import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {componentMotions} from './renderer/portfolio/v1/motion-catalog.mjs';

const report=JSON.parse(readFileSync(new URL('../../docs/library/previews/portfolio/source-motion-audit.json',import.meta.url)));
test('코드 확보 섹션과 콘텐츠 요소를 한 번씩 점검하고 선별 항목을 생성 모션에 연결한다',()=>{
 assert.equal(report.summary.total,368);
 assert.equal(report.items.length,368);
 assert.equal(new Set(report.items.map(item=>item.id)).size,368);
 assert.equal(report.summary.sections+report.summary.contentElements,368);
 assert.equal(report.summary.complexSignal+report.summary.transitionOrHover+report.summary.noSignal,368);
 assert.equal(report.summary.shortlisted+report.summary.reference+report.summary.excluded+report.summary.pending,368);
 const shortlisted=report.items.filter(item=>item.selection==='shortlisted');
 assert.equal(shortlisted.length,8);
 assert.deepEqual(shortlisted.map(item=>item.id).sort(),componentMotions.filter(item=>item.sourceItemId).map(item=>item.sourceItemId).sort());
 assert.ok(shortlisted.every(item=>item.motionSupport&&componentMotions.some(motion=>motion.id===item.motionSupport)));
});
