#!/usr/bin/env python3
"""2단계 수집본을 보존하고 재분류·선별·고정 버전 보강 결과를 생성합니다."""
from __future__ import annotations
import argparse, collections, datetime as dt, hashlib, json, re, subprocess
from pathlib import Path
from urllib.parse import quote
from acquire import ROOT, OUT, role_for
from collect import dump

LOCK = ROOT/'scripts/library/stage-3-sources.json'
WORK = ROOT/'artifacts/portfolio-library/stage-3'

def digest(raw): return hashlib.sha256(raw).hexdigest()
def read(path): return json.loads(path.read_text())

def source_text(repo, path):
    target = (repo/path).resolve()
    if not target.is_relative_to(repo.resolve()): raise ValueError('저장소 밖 경로')
    return target.read_bytes().decode('utf-8')

def family_name(name):
    # 같은 이름 계열만 묶습니다. 구조가 동일하다고 판정하지 않습니다.
    return re.sub(r'(?:-base|-\d+)$', '', name)

def material(folder, name, raw, label, kind):
    path = OUT/'materials'/folder/name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return dict(path='./library/materials/'+folder+'/'+name, sha256=digest(raw), bytes=len(raw), label=label, kind=kind)

def main(fetch=False):
    lock = read(LOCK)
    base, acquired = read(OUT/'catalog.json'), read(OUT/'acquisitions.json')
    originals = base['items'] + acquired['additions']
    acquisitions = {x['id']: x for x in acquired['items']}
    updates, additions, sources = [], [], []
    family_groups, hash_groups = collections.defaultdict(list), collections.defaultdict(list)
    code_count = 0
    corrected = []
    excluded = {'career-1', 'career-2', 'career-3', 'career-4', 'timeline', 'portfolio-dashboard', 'project-management-dashboard'}
    selected = {
        'hero-1': ('hero', ['brand','headline','description','navLinks','ctaHref'], ['고정 배경 이미지·로그인 버튼·스크롤 문구를 속성으로 분리해야 합니다.']),
        'contact-1': ('contact', ['title','description','contactMethods'], ['기업용 기본 문구를 개인 연락처로 교체하고 ReactNode 아이콘을 ID로 바꿔야 합니다.']),
        'code-block': ('technical-evidence', ['code','language','theme'], ['Shiki 의존성·허용 언어·복사 버튼·중복 DOM ID를 검증해야 합니다.']),
        'chart': ('outcome', ['config','data'], ['차트 보조 프리미티브입니다. 성과의 단위·기간·출처를 담는 섹션으로 조합해야 합니다.']),
    }
    for item in originals:
        old = acquisitions[item['id']]
        roles, reason = role_for(item)
        if item['sourceSite']=='expresso': roles, reason = old['roles'], old['roleEvidence']
        name = item['sourceItemId']
        update = dict(id=item['id'], roles=roles, roleEvidence=reason, roleMethod='identifier_rules_v2', selection='pending', inputs=[], constraints=[], familyId=None)
        if item['sourceSite']=='expresso': update['roleMethod']='authored'
        if roles != old['roles']: corrected.append(dict(id=item['id'], name=name, before=old['roles'], after=roles, reason=reason))
        if item['sourceSite']=='watermelon':
            family = 'watermelon-'+family_name(name)
            family_groups[family].append(item['id']); update['familyId']=family
            registry = OUT/'materials/watermelon/registry'/(name+'.json')
            if registry.exists():
                code_count += 1
                payload=read(registry)
                contents=sorted(f.get('content','') for f in payload.get('files',[]))
                if contents: hash_groups[digest(json.dumps(contents,ensure_ascii=False).encode())].append(item['id'])
            if name in excluded:
                update.update(selection='excluded', roleMethod='source_review', constraints=['개인 포트폴리오 본문 후보에서 제외합니다. 원본은 보조 UI 참고로 보존합니다.'])
            elif name in selected:
                role, inputs, notes=selected[name]
                update.update(roles=[role], selection='shortlisted', roleMethod='source_review', inputs=inputs, constraints=notes, roleEvidence='원본 입력·구현을 확인한 이식 후보입니다. 실제 경력 콘텐츠의 렌더링 검증은 남아 있습니다.')
            elif name in ('bento-1','stats-1','footer-1','preview-link-card'):
                update.update(selection='reference', roleMethod='source_review', constraints=['샘플 데이터·입력 구조를 수정하거나 본문 섹션 안에 조합해야 합니다. 원본 실행 확인과 제품 품질 검증은 별개입니다.'])
        updates.append(update)

    for source in lock['sources']:
        repo=WORK/source['folder']
        if fetch:
            if not repo.exists(): subprocess.run(['git','clone','--no-checkout','https://github.com/'+source['repo']+'.git',str(repo)],check=True)
            subprocess.run(['git','-C',str(repo),'fetch','origin',source['revision']],check=True)
            subprocess.run(['git','-C',str(repo),'checkout','--detach',source['revision']],check=True)
        revision=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
        if revision!=source['revision']: raise ValueError('고정 버전 불일치: '+source['repo'])
        if subprocess.run(['git','-C',str(repo),'diff','--quiet','HEAD']).returncode: raise ValueError('원본 checkout에 변경 사항 존재: '+source['repo'])
        license_raw=(repo/source['license']).read_bytes()
        if b'MIT License' not in license_raw: raise ValueError('검토한 MIT 고지와 다름')
        license_material=material(source['id'],'LICENSE.txt',license_raw,'MIT 라이선스 원문','license')
        url='https://github.com/'+source['repo']
        license_url=url+'/blob/'+revision+'/'+source['license']
        specs=[x for x in lock['items'] if x['source']==source['id']]
        sources.append(dict(id=source['id'],name=source['name'],url=url,licenseUrl=license_url,rightsStatus='allowed',coverageState='partial',discoveredCount=len(specs),categories=[],requestIds=[],fetchedAt=lock['reviewedAt'],method='공식 저장소 고정 commit의 지정 파일 수집',note='MIT 원문과 지정 코드를 보존했습니다. 예제 자산·외부 의존성은 별도이며 실행·제품 통합 검증 전입니다.',nextActions=[dict(kind='validation',url=url,reason='허용 JSON 입력·반응형·실제 경력 콘텐츠 검증')]))
        for spec in specs:
            id=source['id']+'-'+spec['key']
            original=url+'/blob/'+revision+'/'+quote(spec['path'],safe='/')
            files=[dict(path=p,content=source_text(repo,p)) for p in [spec['path']]+spec['extra']]
            bundle=dict(name=spec['key'],sourceRepository=url,sourceRevision=revision,license='MIT',files=files)
            raw=(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n').encode()
            bundle_material=material(source['id'],spec['key']+'.json',raw,'원본 코드 묶음','registry_source')
            is_react=source['framework'].startswith('React')
            # 페이지 라우트와 비 React 템플릿은 구조 참고로 명시합니다.
            kind='component' if is_react and '/app/' not in spec['path'] else 'reference'
            item=dict(id=id,sourceSite=source['id'],sourceItemId=spec['path'],title=spec['title'],titleSource='curated',canonicalUrl=original,sourceUrls=[original],originalUrl=url,artifactKind=kind,categories=['portfolio-section' if kind=='component' else 'content-template'],roles=spec['roles'],discoveredFrom=[url],familyId=None,variant=None,sourceRevision=revision,collectionStatus='discovered',rightsStatus='allowed',reviewStatus='unreviewed',integrationStatus='not_started',preview=None)
            additions.append(item)
            preview=dict(kind='text',text=files[0]['content'][:420],label='원본 코드 발췌 · 실행 전')
            detail_path='./library/items/'+id+'.json'
            updates.append(dict(id=id,roles=spec['roles'],roleEvidence='원본의 데이터 입력과 본문 구성을 확인했습니다.',roleMethod='source_review',selection='shortlisted' if kind=='component' else 'reference',inputs=spec['inputs'],constraints=spec['notes'],familyId=None,preview=preview,detailPath=detail_path,acquisitionStatus='source_ready',collectionStatus='material_ready'))
            detail=dict(id=id,sourceUrl=original,sourceRevision=revision,roles=spec['roles'],roleEvidence='원본 데이터 구조 검토',roleMethod='source_review',materials=[bundle_material,license_material],observations=spec['notes'],inputs=spec['inputs'],framework=source['framework'],sourceLicense=license_url,acquisitionStatus='source_ready',visualReview='not_reviewed',responsiveReview='not_measured',interactionReview='not_measured',codeFiles=[dict(path=f['path'],sha256=digest(f['content'].encode()),bytes=len(f['content'].encode())) for f in files],usageNote='고정 버전의 지정 파일 묶음입니다. 완전한 실행 의존성 묶음은 아니며 설치·렌더링 전입니다.')
            dump(OUT/'items'/(id+'.json'),detail)

    families=[dict(id=k,itemIds=v,method='name_family',reviewStatus='structure_unverified') for k,v in sorted(family_groups.items()) if len(v)>1]
    duplicates=[dict(hash=k,itemIds=v,method='exact_code_content') for k,v in sorted(hash_groups.items()) if len(v)>1]
    grouped={i:g['id'] for g in families for i in g['itemIds']}
    for update in updates: update['familyId']=grouped.get(update['id'])
    gaps=[
        dict(role='project-detail',status='구조 후보 확보',note='긴 글·목차·인용 템플릿을 확보했습니다. 문제–접근–기여–결과 전용 구조는 아직 없습니다.',nextAction='이미지 없는 사례·역할별 기여·전후 비교 입력을 정의하고 필요한 전용 블록을 구현합니다.'),
        dict(role='experience',status='이식 후보 확보',note='개인 경력 목록·연표·CV 템플릿을 확보했습니다.',nextAction='긴 회사명·겹치는 기간·현재 재직·설명 누락을 검증합니다.'),
        dict(role='education',status='이식·구조 후보 확보',note='학력 배열과 날짜 연표 후보를 확보했습니다.',nextAction='학위·학교·기간·활동의 선택 입력을 정의합니다.'),
        dict(role='research',status='구조 후보 확보',note='논문 목록·초록·발표처·참고문헌·연구 본문 소스를 확보했습니다.',nextAction='Liquid/Distill을 React로 이식하고 저자·인용·수식·결과 그림을 검증합니다.'),
        dict(role='outcome',status='추가 설계 필요',note='차트 프리미티브는 있습니다. 지표의 단위·기간·기준선·근거를 담는 섹션은 미확보입니다.',nextAction='성과 비교·실험 결과 표의 입력 계약과 후보를 보강합니다.'),
        dict(role='media',status='재사용 검토 필요',note='기존 브라우저·기기·미디어 UI를 별도 역할로 재분류했습니다.',nextAction='이미지 확대·캡션·대체 텍스트·출처와 영상 없는 대체 상태를 검증합니다.')]
    result=dict(schemaVersion=1,runId='2026-09-26-stage-3',generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),reviewedAt=lock['reviewedAt'],sources=sources,additions=additions,updates=updates,families=families,duplicates=duplicates,gaps=gaps,corrections=corrected,stats=dict(originalItems=len(originals),addedItems=len(additions),roleCorrections=len(corrected),sourceReviewed=sum(x['roleMethod']=='source_review' for x in updates),selection=dict(collections.Counter(x['selection'] for x in updates)),codeItemsCompared=code_count,nameFamilies=len(families),exactDuplicateGroups=len(duplicates)))
    dump(OUT/'curation.json',result)
    print(json.dumps(result['stats'],ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fetch',action='store_true');main(parser.parse_args().fetch)
