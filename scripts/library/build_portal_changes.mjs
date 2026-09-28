// 포털 UI 변경 커밋과 이번 릴리스 노트를 알림 목록에 싣습니다.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lines=execFileSync('git',['log','-n','8','--format=%H%x1f%aI%x1f%s','--','docs/Expresso 개발 포털.dc.html','docs/library/portal-library.mjs','docs/library/portal-documentation.css','docs/library/componentry.json'],{cwd:root,encoding:'utf8'}).trim().split('\n');
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
const documentIconsSubject='개발 문서 카드별 아이콘 추가';
const documentIconsSummary='개발 문서 카드 11개에 자료 성격을 나타내는 아이콘을 추가했습니다.';
const bareIconsSubject='개발 문서 카드 아이콘 배경 제거';
const bareIconsSummary='개발 문서 카드의 아이콘 뒤에 있던 배경과 테두리를 제거했습니다.';
const componentrySubject='Componentry 공식 registry 자료 추가';
const componentrySummary='UI 53개와 블록 3개의 원본 코드·이용 조건·공식 시연 자료를 라이브러리에서 확인합니다.';
const componentryRenderSubject='Componentry 원본 렌더링 예제 추가';
const componentryRenderSummary='Componentry 56개 모두 카드에 실제 렌더 화면을 표시하고 상세에서 실행 예제를 조작할 수 있습니다.';
const fictionalPortfolioSubject='Componentry 가상 포트폴리오 예제 추가';
const fictionalPortfolioSummary='프로젝트형 예제 4개를 개인정보 없는 가상 프로젝트와 전용 화면으로 확인합니다.';
const compositionSubject='json-render 포트폴리오 조합 예제 추가';
const comparisonSubject='구조화·자유 포트폴리오 생성 비교 추가';
const variantsSubject='포트폴리오 구성안과 프로젝트 표현 확장';
const releaseNotes=new Map([
 ['포트폴리오 시제품 전시와 화면 조작 추가',{summary:'첫 화면과 프로젝트 사례에서 가상 지도·관계도·층별 경로를 직접 조작합니다.',href:'#/library'}],
 ['포트폴리오 에디토리얼·포스터 디자인 분리',{summary:'같은 가상 콘텐츠를 서로 다른 색·서체·첫 화면·이미지 프레임으로 비교합니다.',href:'#/library'}],
 [newSubject,{summary:newSummary,href:'#/docs'}],
 [directTabsSubject,{summary:directTabsSummary,href:'#/docs'}],
 [documentIconsSubject,{summary:documentIconsSummary,href:'#/docs'}],
 [bareIconsSubject,{summary:bareIconsSummary,href:'#/docs'}],
 [componentrySubject,{summary:componentrySummary,href:'#/library/all?source=componentry'}],
 [componentryRenderSubject,{summary:componentryRenderSummary,href:'#/library/all?source=componentry'}],
 [fictionalPortfolioSubject,{summary:fictionalPortfolioSummary,href:'#/library/all/componentry-case-study-flip-stack?source=componentry'}],
 [compositionSubject,{summary:'가상 데이터로 만든 완성 페이지에서 네 가지 입력과 정적 HTML을 비교합니다.',href:'#/library'}],
 [comparisonSubject,{summary:'같은 모델과 가상 데이터로 생성한 지면의 품질·시간·비용을 비교합니다.',href:'#/library'}],
 [variantsSubject,{summary:'대표 사례·갤러리 구성안에서 프로젝트별 이미지·과정·본문 표현과 근거 자료를 비교합니다.',href:'#/library'}],
]);
const history=lines.filter(Boolean).map(line=>{
 const [id,stamp,subject]=line.split('\x1f');
 const title=subject.replace(/^[a-z]+: /,'');
 const release=releaseNotes.get(title);
 return {id,date:stamp.slice(0,10),title,summary:release?.summary||notes[id.slice(0,8)]||'개발 포털 화면과 자료 구성이 업데이트됐습니다.',href:release?.href||(id.startsWith('d941')?'#/docs':'#/library')};
});
const items=history.slice(0,8);
fs.writeFileSync(path.join(root,'docs/library/portal-changes.json'),JSON.stringify({schemaVersion:1,items},null,2)+'\n');
console.log('portal changes',items.length);
