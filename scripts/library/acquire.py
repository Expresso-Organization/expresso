#!/usr/bin/env python3
"""1단계 ID에 원본 파일·공식 참고 이미지·자료별 이용 결과를 연결합니다."""
from __future__ import annotations
import collections,datetime as dt,gzip,hashlib,html,json,re,shutil
from html.parser import HTMLParser
from types import SimpleNamespace
from pathlib import Path
from urllib.parse import urljoin,urlsplit,unquote
import xml.etree.ElementTree as ET
from collect import canonical,dump
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'artifacts/portfolio-library/stage-2'
OUT=ROOT/'docs/library'
REPOS=WORK/'repos'

def sha(value):return hashlib.sha256(value).hexdigest()
def public_path(path):return './'+str(path.relative_to(ROOT/'docs'))
def copy_material(source,destination):
    destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
    return dict(path=public_path(destination),sha256=sha(destination.read_bytes()),bytes=destination.stat().st_size)

class Page(HTMLParser):
    def __init__(self,text):
        super().__init__(convert_charrefs=True);self.meta={};self.images=[];self.posters=[];self.videos=[];self.links=[];self.h1=[];self.current=None;self.heading=None;self.feed(text)
    def handle_starttag(self,t,attrs):
        d=dict(attrs)
        if t=='meta':self.meta[d.get('property',d.get('name',''))]=d.get('content','')
        if t=='img':self.images.append(d)
        if t=='video' and d.get('poster'):self.posters.append(d['poster'])
        if t in ('video','source') and d.get('src'):self.videos.append(d['src'])
        if t=='a':self.current=[d.get('href',''),'']
        if t=='h1':self.heading=''
    def handle_data(self,text):
        if self.current is not None:self.current[1]+=text
        if self.heading is not None:self.heading+=text
    def handle_endtag(self,t):
        if t=='a' and self.current is not None:self.links.append(self.current);self.current=None
        if t=='h1' and self.heading is not None:self.h1.append(self.heading.strip());self.heading=None

def media_for(page,item):
    site=item['sourceSite'];url=item['canonicalUrl'];slug=urlsplit(url).path.split('/')[-1]
    def valid(u):
        if not u:return None
        u=urljoin(url,html.unescape(u or ''))
        if not canonical(u) or canonical(u)==canonical(url) or re.search(r'(?:favicon|/s2/|og-image|/logo[./-]|ads%20|/ads/)',u,re.I):return None
        return u
    if site=='navbar':
        found=next((x.get('src') for x in page.images if 'individual-image' in x.get('class','').split()),None)
        return valid(found),'detail_image'
    if page.posters:
        return valid(page.posters[0]),'video_poster'
    if site=='supahero':
        found=next((x.get('src') for x in page.images if '/heroes/' in x.get('src','')),None)
        return valid(found),'detail_image'
    if site=='unsection':
        found=next((x.get('src') for x in page.images if 'unsection.b-cdn.net/' in x.get('src','') and 'ads%' not in x.get('src','').lower()),None)
        return valid(found),'detail_image'
    if site in ('footer','404','cta','60fps'):
        image=valid(page.meta.get('og:image'))
        if image:return image,'open_graph'
    target=re.sub(r'[^a-z0-9]','',slug.lower())
    candidates=[]
    for n,img in enumerate(page.images):
        src=valid(img.get('src'))
        if not src or '.svg' in src.lower():continue
        name=re.sub(r'[^a-z0-9]','',(unquote(src)+' '+img.get('alt','')).lower())
        score=(100 if target and target in name else 0)+(30 if 'website-files.com' in src else 0)-n
        candidates.append((score,src))
    return (max(candidates)[1],'detail_image') if candidates else (None,None)

ROLE_RULES=[
 (r'hero|/hero/','hero','대표 소개와 핵심 메시지를 배치할 후보입니다.'),
 (r'bento|gallery|portfolio|project|case.study','project-grid','작품·프로젝트·사례를 묶어 보여주는 표현 후보입니다.'),
 (r'timeline|experience|career|history','experience','경력과 과정의 순서를 설명할 후보입니다.'),
 (r'\b(?:chart|graph|metrics?|stats?|growth|results?)(?:\b|_)','outcome','성과와 수치의 비교를 표현할 후보입니다.'),
 (r'testimonial|review|quote','evidence','협업 평가와 근거를 배치할 후보입니다.'),
 (r'footer|contact|/cta/|cta-','contact','본문을 읽은 뒤 연락·외부 자료로 이어 줄 후보입니다.'),
 (r'navbar|navigation|menu','navigation','페이지·사례 사이의 탐색을 구성할 후보입니다.'),
 (r'feature|about|team|skill','capability','역할·역량·기여를 설명할 후보입니다.'),
 (r'404|/sites/','supporting-page','보조 화면의 구성과 상태 표현을 참고합니다.')]
def role_for(item):
    if item['artifactKind']=='icon':return ['icon'], '아이콘의 원본 의미 분류를 탐색·링크·자료 유형 표시에 대응합니다.'
    if item['artifactKind']=='diagram':return ['technical-evidence'], '시스템 구조·과정·기술 기여를 설명하는 도식 후보입니다.'
    if item['artifactKind']=='registry':return ['supplier'], '공식 registry와 이용 조건을 추가 탐색할 공급자입니다.'
    if item['sourceSite']=='watermelon':
        name=item['sourceItemId']
        if re.fullmatch(r'career-[1-4]',name):return ['supporting-ui'],'원본 jobs·지원 링크를 확인한 채용 공고 UI입니다. 개인 경력 이력과 구분합니다.'
        if name=='timeline':return ['supporting-ui'],'원본 startHour·duration·드래그 슬롯을 확인한 시간대별 일정 편집기입니다.'
        if name=='portfolio-dashboard':return ['supporting-ui'],'원본 totalBalance·자산 배분을 확인한 금융 대시보드입니다.'
        if name=='project-management-dashboard':return ['supporting-ui'],'원본 Tasks·Calendar·Team을 확인한 프로젝트 관리 대시보드입니다.'
        if name in ('code','code-block','code-tabs','terminal','preview-link-card'):return ['technical-evidence'],'코드·실행 결과·외부 링크 표현 후보입니다. 섹션으로 조합하고 출처 데이터를 연결해야 합니다.'
        if name in ('browser','device','video','audio-player','mobile-video-player'):return ['media'],'스크린샷·영상·음성 표현 후보입니다. 실제 자산과 대체 표현 검증이 필요합니다.'
    text=' '.join([item['sourceItemId'],item['title'],*item['categories']]).lower()
    for pattern,role,reason in ROLE_RULES:
        if re.search(pattern,text):return [role],reason
    if item['artifactKind']=='motion':return ['interaction'], '선택·확대·이동·피드백을 설명하는 동작 참고입니다.'
    return ['supporting-ui'],'포트폴리오 편집기 또는 보조 표현으로 활용할 수 있는지 검토할 항목입니다.'

def svg_safe(raw):
    root=ET.fromstring(raw)
    for element in root.iter():
        if element.tag.split('}')[-1].lower() in ('script','foreignobject'):return False
        for key,value in element.attrib.items():
            if key.lower().startswith('on'):return False
            if key.split('}')[-1].lower()=='href' and not value.startswith('#'):return False
    return True

def static_diagram(raw):
    # 원본은 텍스트 파일로 보존하고, 미리보기에는 스크립트와 외부 리소스를 넣지 않습니다.
    text=re.sub(r'<script\b[^>]*>.*?</script>','',raw,flags=re.S|re.I)
    text=re.sub(r'<link\b[^>]*>','',text,flags=re.I)
    csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'\">"
    return re.sub(r'<head[^>]*>',lambda m:m[0]+csp,text,count=1,flags=re.I)

def registry_detail(item,source):
    path=REPOS/'watermelon/public/r'/(item['sourceItemId']+'.json')
    if not path.exists():return None
    payload=json.loads(path.read_text())
    material=copy_material(path,OUT/'materials/watermelon/registry'/path.name)
    files=[]
    for file in payload.get('files',[]):
        content=file.get('content','');files.append(dict(path=file['path'],target=file.get('target'),type=file.get('type'),sha256=sha(content.encode()),bytes=len(content.encode())))
    text='\n'.join(f.get('content','') for f in payload.get('files',[]))
    interfaces=re.findall(r'(?:export\s+)?(?:interface\s+\w+(?:Props|Config)|type\s+\w+Props\s*=)[^{]*\{[^}]*\}',text,re.S)
    imports=sorted(set(re.findall(r'from\s+[\'"]([^\'"]+)',text)))
    urls=sorted(set(re.findall(r'https?://[^\s"\'<>`)]+',text)))
    detail=dict(materials=[dict(material,kind='registry_source',label='원본 registry JSON')],codeFiles=files,
        dependencies=payload.get('dependencies',[]),registryDependencies=payload.get('registryDependencies',[]),
        imports=imports,propsDeclarations=interfaces,propsExtraction='source_declaration_not_runtime_schema',
        externalAssets=urls,framework='React / TypeScript / Tailwind CSS',
        installation=f"pnpm dlx shadcn@latest add https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/{source['revision']}/public/r/{path.name}",
        usageNote='원본의 기본값과 props 선언을 함께 확인하세요. registryDependencies와 import 목록은 원본 그대로이며 실행 시 추가 의존성이 필요할 수 있습니다.')
    return detail

def main():
    catalog=json.loads((OUT/'catalog.json').read_text());sources={s['id']:s for s in catalog['sources']}
    build=json.loads((OUT/'previews/watermelon/build-results.json').read_text())
    builds={i['name']:i for i in build}
    verified_path=OUT/'previews/watermelon/verification.json'
    verified=json.loads(verified_path.read_text()).get('results',{}) if verified_path.exists() else {}
    for source in ['watermelon','rune','diagram']:
        for name in ['LICENSE','NOTICE','README.md']:
            f=REPOS/source/name
            if f.exists():copy_material(f,OUT/'materials'/source/(name+'.txt'))
    bento_raw=(ROOT/'artifacts/portfolio-library/probe/bento.txt').read_text()
    bento=json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',bento_raw)[1])['props']['pageProps']['shots']
    bento={s['id']:s for s in bento}
    results=[];receipts=[]
    for item in catalog['items']:
        source=sources[item['sourceSite']];site=source['id'];roles,role_reason=role_for(item)
        update=dict(id=item['id'],roles=roles,roleEvidence=role_reason,roleMethod='identifier_and_source_category',preview=None,
                    acquisitionStatus='reference_ready',collectionStatus='metadata_ready',detailPath=f"./library/items/{item['id']}.json")
        detail=dict(id=item['id'],sourceUrl=item['canonicalUrl'],sourceRevision=item['sourceRevision'],roles=roles,
                    roleEvidence=role_reason,roleMethod=update['roleMethod'],materials=[],observations=[],
                    visualReview='not_reviewed',responsiveReview='not_measured',interactionReview='not_measured')
        if site=='watermelon':
            acquired=registry_detail(item,source)
            if acquired:
                detail.update(acquired);update.update(acquisitionStatus='source_ready',collectionStatus='material_ready')
                verification=verified.get(item['sourceItemId'])
                candidate=builds.get(item['sourceItemId'])
                if candidate:detail['example']=candidate
                if verification:detail['renderCheck']=verification
                if candidate and candidate['status']=='built' and verification and verification['status']=='ready':
                    update['preview']=dict(kind='local_frame',url=candidate['url'].replace('.html','.static.html'),liveUrl=candidate['url'],label='원본 코드 렌더링',sourceUrl=item['canonicalUrl'],width=1280,height=880,interactive=True)
                else:update['previewReason']='원본 코드 확보 · 예제 입력과 실행 환경 확인 필요'
            else:
                update.update(acquisitionStatus='access_blocked',previewReason='고정 registry에 대응하는 코드 파일 없음')
                detail['observations'].append('사이트맵에만 있는 항목입니다. 고정 registry의 이름과 대응하지 않아 소스 연결을 보류했습니다.')
        elif site=='rune':
            f=REPOS/'rune'/item['sourceItemId'];raw=f.read_bytes()
            if not svg_safe(raw):
                update.update(acquisitionStatus='permission_needed',previewReason='SVG 외부 참조 검토 필요')
            else:
                material=copy_material(f,OUT/'materials/rune'/f"{item['id']}.svg")
                detail['materials']=[dict(material,kind='svg_source',label='원본 SVG')]
                update.update(acquisitionStatus='source_ready',collectionStatus='material_ready',preview=dict(kind='local_image',url=material['path'],label='원본 SVG',sourceUrl=item['canonicalUrl']))
                detail['usageNote']='스타일·크기·stroke 적용을 확인한 뒤 제품에서 사용합니다. Apache-2.0 LICENSE 및 변경 표시를 보존합니다.'
        elif site=='diagram':
            f=REPOS/'diagram'/item['sourceItemId'];material=copy_material(f,OUT/'materials/diagram'/f"{item['id']}{f.suffix}.txt")
            detail['materials']=[dict(material,kind='diagram_source' if f.suffix=='.html' else 'reference_source',label='원본 '+f.name)]
            update.update(acquisitionStatus='source_ready',collectionStatus='material_ready')
            if f.suffix=='.html':
                preview=OUT/'previews/diagram'/f"{item['id']}.html";preview.parent.mkdir(parents=True,exist_ok=True);preview.write_text(static_diagram(f.read_text()))
                update['preview']=dict(kind='local_frame',url=public_path(preview),label='원본 예제 · 정적 표시',sourceUrl=item['canonicalUrl'],width=1280,height=880,interactive=False)
                detail['observations'].append('예제 원문에서 스크립트·외부 폰트 링크를 제외한 미리보기입니다. 원본 파일은 별도로 보존했습니다.')
            else:update['previewReason']='텍스트 자료 · 원문 보기 가능'
        elif site in ('motion','kobra','codedvisuals'):
            reason={'motion':'공식 약관의 프롬프트 재배포·갤러리 수집 제한', 'kobra':'코드 재배포와 생성 라이브러리 이용 범위 확인 필요','codedvisuals':'상용 라이선스의 AI builder·site builder 사용 제한'}[site]
            update.update(acquisitionStatus='permission_needed',rightsStatus='permission_needed' if site!='codedvisuals' else 'reference_only',previewReason=reason)
            detail['observations']=[reason];detail['licenseUrl']=source.get('licenseUrl')
        elif site=='bento':
            shot=bento[item['sourceItemId']];asset=shot['assets'][0]
            # 실제 갤러리 DOM의 s.bentogrids.com 경로와 mp4의 webp 포스터 형식을 확인했습니다.
            ext='webp' if asset['isVideo'] else asset['format'];url=f"https://s.bentogrids.com/{asset['id']}.{ext}"
            update.update(collectionStatus='material_ready',preview=dict(kind='remote_image',url=url,label='공식 갤러리 참고 이미지',sourceUrl=source['url']))
            detail['originalUrl']=shot.get('sourceLink');detail['observations']=[f"공개 분류: {shot['category']}",f"원본 종횡비: {asset['width']}×{asset['height']}",f"동일 사례 자산: {len(shot['assets'])}개"]
        elif site=='shoogle':
            update.update(acquisitionStatus='out_of_scope',previewReason='공급자 디렉터리 · 개별 컴포넌트는 다음 확장 대상')
            detail['observations']=['상세 수집의 코드 단위는 공급자별 registry 항목입니다. 이 항목은 공급자 식별·접근 경로로 보존합니다.']
        else:
            key=sha(item['canonicalUrl'].encode())[:24];meta=WORK/'details'/f'{key}.json'
            if meta.exists():
                receipt=json.loads(meta.read_text());receipts.append(receipt)
                if receipt['status']==200:
                    parsed_path=meta.with_suffix('.parsed.json')
                    parsed=json.loads(parsed_path.read_text()) if parsed_path.exists() else None
                    if not parsed or parsed.get('sha256')!=receipt['sha256']:
                        raw=gzip.decompress(meta.with_suffix('.gz').read_bytes()).decode('utf-8',errors='replace');page=Page(raw)
                        parsed={'sha256':receipt['sha256'],**{key:getattr(page,key) for key in ['meta','images','posters','videos','links','h1']}}
                        parsed_path.write_text(json.dumps(parsed,ensure_ascii=False))
                    page=SimpleNamespace(**parsed);url,origin=media_for(page,item)
                    update.update(collectionStatus='material_ready')
                    title=next((t for t in page.h1 if t and t.lower() not in ('footr design','404s','navbar gallery')),None)
                    if title and len(title)<160:update.update(title=title,titleSource='detail_page')
                    if url:update['preview']=dict(kind='remote_image',url=url,label='공식 동영상 포스터' if origin=='video_poster' else '공식 참고 이미지',sourceUrl=item['canonicalUrl'],extraction=origin)
                    else:update['previewReason']='상세 정보 확보 · 공개 이미지 없음'
                    if update['preview']:
                        responsive=next((img.get('srcset','') for img in page.images if img.get('src')==url),'')
                        variants=[(int(width),candidate) for candidate,width in re.findall(r'(\S+)\s+(\d+)w',responsive)]
                        eligible=sorted((width,candidate) for width,candidate in variants if width>=400 and canonical(candidate))
                        if eligible:update['preview']['thumbnailUrl']=html.unescape(eligible[0][1])
                    original=next((canonical(urljoin(item['canonicalUrl'],u)) for u,label in page.links if re.search(r'view\s*(?:web)?site|visit\s*(?:web)?site|^website$',label.strip(),re.I) and urlsplit(urljoin(item['canonicalUrl'],u)).netloc!=urlsplit(item['canonicalUrl']).netloc),None)
                    if original:detail['originalUrl']=original;update['originalUrl']=original
                    detail['observations']=[f"상세 제목: {title or item['title']}",f"공개 이미지 요소: {len(page.images)}개",f"동영상 포스터: {len(page.posters)}개"]
                    detail['evidence']=dict(url=receipt['url'],sha256=receipt['sha256'],fetchedAt=receipt['fetchedAt'],method='public_detail_html')
                else:
                    update.update(acquisitionStatus='access_blocked',collectionStatus='access_blocked',previewReason=f"상세 요청 실패: HTTP {receipt['status']}");detail['observations']=[receipt.get('reason','응답 확인 필요')]
            else:
                update.update(acquisitionStatus='access_blocked',collectionStatus='access_blocked',previewReason='상세 응답 미확보 · 접근 기록 확인 필요')
                detail['observations']=['상세 요청 결과가 없거나 해당 공급자 요청이 접근 제한 후 중단되었습니다.']
        if update['preview'] and update['preview']['kind']=='remote_image':
            detail['previewRights']='원본 호스트의 공개 참고 이미지 링크입니다. 원본 미디어 복제·제품 삽입 권한은 포함하지 않습니다.'
        detail['acquisitionStatus']=update['acquisitionStatus'];detail['previewReason']=update.get('previewReason');detail['sourceLicense']=source.get('licenseUrl')
        dump(OUT/'items'/f"{item['id']}.json",detail);results.append(update)
    additions=[]
    prompt_source='https://github.com/Expresso-Organization/expresso/blob/codex/portfolio-reference-research/scripts/library/prompts.json'
    for prompt in json.loads((ROOT/'scripts/library/prompts.json').read_text()):
        item_id='expresso-'+prompt['id']
        item=dict(id=item_id,sourceSite='expresso',sourceItemId=prompt['id'],title=prompt['title'],titleSource='authored',canonicalUrl=prompt_source,sourceUrls=[prompt_source],originalUrl=None,artifactKind='prompt',categories=['portfolio-workflow'],roles=['quality-workflow'],discoveredFrom=[prompt_source],familyId=None,variant=None,sourceRevision='1.0',collectionStatus='discovered',rightsStatus='allowed',reviewStatus='unreviewed',integrationStatus='not_started',preview=None)
        additions.append(item)
        preview=dict(kind='text',text=prompt['body'][:190],label='자체 작성 · 실행 전')
        update=dict(id=item_id,roles=item['roles'],roleEvidence=prompt['purpose'],roleMethod='authored',preview=preview,acquisitionStatus='prompt_ready',collectionStatus='material_ready',detailPath=f'./library/items/{item_id}.json')
        detail=dict(id=item_id,sourceUrl=prompt_source,sourceRevision='1.0',roles=item['roles'],roleEvidence=prompt['purpose'],materials=[],observations=['익스프레소에서 직접 작성한 템플릿입니다. 모델 실행·품질 평가는 아직 수행하지 않았습니다.'],prompt=dict(prompt,version='1.0',executionStatus='not_run'),acquisitionStatus='prompt_ready',visualReview='not_reviewed',responsiveReview='not_measured',interactionReview='not_measured')
        dump(OUT/'items'/f'{item_id}.json',detail);results.append(update)
    stats=dict(total=len(results),states=dict(collections.Counter(i['acquisitionStatus'] for i in results)),previews=dict(collections.Counter(i['preview']['kind'] for i in results if i['preview'])))
    manifest=dict(schemaVersion=1,runId='2026-09-23-stage-2',generatedAt=max([r['fetchedAt'] for r in receipts]+[v['checkedAt'] for v in verified.values()]),items=results,additions=additions,stats=stats,sources=[dict(id='expresso',name='Expresso',url='https://github.com/Expresso-Organization/expresso',rightsStatus='allowed',coverageState='snapshot_complete',discoveredCount=len(additions),nextActions=[],categories=[],requestIds=[],fetchedAt='2026-09-23',note='포트폴리오 컴포넌트 이식·레시피·품질 검토용 자체 작성 프롬프트입니다. 실행 전 상태입니다.',method='자체 작성 템플릿')],
        sourceNotes={'motion':'공식 약관에서 프롬프트·명세 재배포, 경쟁 컬렉션 구축, 갤러리 scraping 제한을 확인했습니다. 기존 공개 링크를 권한 대기로 관리합니다.'})
    for source in catalog['sources']:
        subset=[entry for entry,item in zip(results,catalog['items']) if item['sourceSite']==source['id']]
        if source['id'] in ('watermelon','rune','diagram'):
            ready=sum(x['acquisitionStatus']=='source_ready' for x in subset)
            manifest['sourceNotes'][source['id']]=f'고정 저장소 버전에서 {ready:,}개 항목의 원본 소스·자산과 라이선스를 확보했습니다. 제품 적용과 실제 경력 콘텐츠 검증은 후속 단계입니다.'
        elif source['id'] in ('navbar','supahero','404','footer','cta','unsection','60fps','bento'):
            ready=sum(x['acquisitionStatus']=='reference_ready' for x in subset)
            preview=sum(bool(x['preview']) for x in subset)
            manifest['sourceNotes'][source['id']]=f'{ready:,}개 항목의 공개 참고 정보를 확보하고 공식 참고 이미지 {preview:,}개를 연결했습니다. 이미지 링크의 제공은 원본 디자인·미디어의 제품 사용 허가를 뜻하지 않습니다.'
    manifest['sourceNotes']['spells']='2026-09-23 공식 RSS를 다시 확인했으며 HTTP 429로 자료 확보가 중단된 상태입니다.'
    dump(OUT/'acquisitions.json',manifest)
    policy_urls=['https://designspells.com/feed','https://www.motionin.design/terms','https://www.originkit.dev/docs/licensing','https://codedvisuals.com/license','https://kobra.systems/terms']
    policy_receipts=[json.loads((WORK/'details'/f'{sha(url.encode())[:24]}.json').read_text()) for url in policy_urls if (WORK/'details'/f'{sha(url.encode())[:24]}.json').exists()]
    dump(OUT/'acquisition-run.json',dict(runId=manifest['runId'],policyRequests=policy_receipts,repositories=[json.loads((REPOS/(name+'.receipt.json')).read_text()) for name in ['watermelon','rune','diagram']],requests=receipts))
    print(json.dumps(stats,ensure_ascii=False))
if __name__=='__main__':main()
