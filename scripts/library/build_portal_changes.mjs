// 포털 UI 변경 커밋과 이번 릴리스 노트를 알림 목록에 싣습니다.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lines=execFileSync('git',['log','-n','8','--format=%H%x1f%aI%x1f%s','--','docs/Expresso 개발 포털.dc.html','docs/library/portal-library.mjs','docs/library/portal-documentation.css'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const notes={
 d941505c:'상단을 개발 문서·라이브러리·프리젠테이션으로 정리하고 문서 카드 목록을 추가했습니다.',
 '17f4cd96':'라이브러리 상세 모달을 열고 닫아도 목록 스크롤 위치가 유지됩니다.',
 ed87b762:'라이브러리 상세 모달에서 실행 예제를 바로 조작할 수 있습니다.',
 bd62adf8:'검색·사이트·분류를 정렬하고 상세 필터를 접을 수 있게 했습니다.',
 e7d00f18:'자료 목록에서 수집 작업 관리 영역을 제거했습니다.',
 '79546740':'페이지 조립 카드에서 미리보기 이미지를 제거했습니다.',
 '86fabc2a':'컴포넌트를 조립 단위로 분류하고 카드 탐색을 추가했습니다.',
 '27cad9fa':'참고 자료를 디자인·콘텐츠·개발 도구로 나눴습니다.'
};
const newSubject='포털 통합 검색·테마·변경 알림 추가';
const newSummary='문서·발표 자료·라이브러리를 함께 검색하고 테마 및 변경 알림을 상단에서 확인합니다.';
const directTabsSubject='문서 바로가기 탭과 아이콘 전용 도구 버튼 추가';
const directTabsSummary='설계서·화면 정의서·디자인 시스템·아이콘을 상단 탭에서 열고, 테마와 알림을 아이콘 버튼으로 조작합니다.';
const history=lines.filter(Boolean).map(line=>{
 const [id,stamp,subject]=line.split('\x1f');
 const title=subject.replace(/^[a-z]+: /,'');
 return {id,date:stamp.slice(0,10),title,summary:title===directTabsSubject?directTabsSummary:title===newSubject?newSummary:notes[id.slice(0,8)]||'개발 포털 화면과 자료 구성이 업데이트됐습니다.',href:title===directTabsSubject||title===newSubject||id.startsWith('d941')?'#/docs':'#/library'};
});
const inHistory=history.some(item=>item.title===newSubject);
const draft=inHistory?[]:[{id:'portal-controls-2026-09-26',date:'2026-09-26',title:newSubject,summary:newSummary,href:'#/docs'}];
const items=[...draft,...history].slice(0,8);
fs.writeFileSync(path.join(root,'docs/library/portal-changes.json'),JSON.stringify({schemaVersion:1,items},null,2)+'\n');
console.log('portal changes',items.length);
