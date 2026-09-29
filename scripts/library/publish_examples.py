#!/usr/bin/env python3
"""검증한 실행 예제와 공식 모션 영상·문서 원문을 포털에 연결합니다."""
from __future__ import annotations
import collections,datetime as dt,gzip,hashlib,json,re
from pathlib import Path
from urllib.parse import urljoin,urlsplit
from acquire import ROOT,OUT,Page
from collect import dump
from verify_examples import snapshot_document

def read(path):return json.loads(path.read_text())
def main():
 base,acquired,curated=read(OUT/'catalog.json'),read(OUT/'acquisitions.json'),read(OUT/'curation.json')
 updates={x['id']:x for x in acquired['items']};reviews={x['id']:x for x in curated['updates']}
 items=[{**x,**updates.get(x['id'],{}),**reviews[x['id']]} for x in base['items']+acquired['additions']+curated['additions']]
 builds=read(OUT/'previews/examples/build-results.json');checked=read(OUT/'previews/examples/verification.json')['results']
 manual=read(ROOT/'scripts/library/renderer/example-snippets.json');automatic=read(ROOT/'scripts/library/renderer/auto-fixtures.json')
 missing=[x['name'] for x in builds if x['status']!='built' or checked.get(x['id'],{}).get('status')!='ready']
 if missing:raise SystemExit('표시 검사 미통과: '+', '.join(missing))
 byid={x['id']:x for x in items};result=[]
 labels={'original_component':'원본 실행 예제','authored_fixture':'데이터·조합 예제','liquid_template_fixture':'Liquid 본문 예제 · 기본 스타일','layout_adapter':'구조 재구현 예제'}
 for build in builds:
  item=byid[build['id']];check=checked[build['id']]
  static=OUT/'previews/examples'/(build['id']+'.static.html')
  if hashlib.sha256(static.read_bytes()).hexdigest()!=check['snapshotSha256']:raise ValueError('정적 예제 해시 불일치')
  body=static.read_text().split('<body>',1)[1].rsplit('</body>',1)[0]
  document=snapshot_document(build['id'],body,(OUT/'previews/examples'/(build['id']+'.html')).read_text())
  static.write_text(document);check['snapshotSha256']=hashlib.sha256(document.encode()).hexdigest()
  check['snapshotStyles']='실행 문서의 stylesheet·inline style 연결'
  mode=build['mode'];example=dict(name=build['name'],status='built',props=build.get('props',{}),entry=build['entry'],url=build['url'],mode=mode,notes=build.get('notes',[]),inputCode=manual.get(build['name'],automatic.get(build['name'],build.get('inputCode',''))))
  if build.get('demoEntry'):example['notes'].append('공급자의 '+build['demoEntry']+' 예제를 해당 원본 부품에 연결했습니다.')
  result.append(dict(id=item['id'],preview=dict(kind='local_frame',url=build['url'].replace('.html','.static.html'),liveUrl=build['url'],label=labels[mode],sourceUrl=item['canonicalUrl'],width=1280,height=880,interactive=True),example=example,renderCheck=check,previewReason=None))
 for item in items:
  if item['artifactKind']=='motion' and item.get('acquisitionStatus')=='reference_ready':
   key=hashlib.sha256(item['canonicalUrl'].encode()).hexdigest()[:24];path=ROOT/'artifacts/portfolio-library/stage-2/details'/(key+'.gz')
   if not path.exists():continue
   raw=gzip.decompress(path.read_bytes()).decode('utf8');first=re.search(r'<video\b[^>]*>[\s\S]*?</video>',raw,re.I)
   if not first:continue
   page=Page(first[0]);poster=item.get('preview',{}).get('url')
   if not page.videos or not page.posters or urljoin(item['canonicalUrl'],page.posters[0])!=poster:continue
   video=urljoin(item['canonicalUrl'],page.videos[0]);parsed=urlsplit(video)
   if parsed.scheme!='https' or parsed.username or not parsed.path.endswith('.mp4'):continue
   result.append(dict(id=item['id'],preview=dict(kind='remote_video',url=video,poster=poster,thumbnailUrl=item['preview'].get('thumbnailUrl',poster),label='공식 모션 영상 · 외부 연결',sourceUrl=item['canonicalUrl']),previewReason=None,referenceOnly=True))
  elif item.get('acquisitionStatus')=='source_ready' and item['sourceSite']=='diagram' and item['artifactKind']=='reference':
   detail=read(OUT/'items'/(item['id']+'.json'));source=detail['materials'][0]['path'];text=(ROOT/'docs'/source[2:]).read_text()
   result.append(dict(id=item['id'],preview=dict(kind='text',text=text[:700],label='문서·도구 원문 발췌'),previewReason=None,referenceOnly=True))
  elif item['artifactKind']=='registry' and not item.get('preview'):
   result.append(dict(id=item['id'],preview=dict(kind='text',text=item['title']+'\n'+(item.get('originalUrl') or item['canonicalUrl']),label='공급자 디렉터리 · 상세에서 공식 출처 확인'),previewReason=None,referenceOnly=True))
 verification=read(OUT/'previews/examples/verification.json');verification['results']=checked;dump(OUT/'previews/examples/verification.json',verification)
 dump(OUT/'examples.json',dict(schemaVersion=1,generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),items=result,stats=dict(executionExamples=len(builds),kinds=dict(collections.Counter(x['preview']['kind'] for x in result)),unavailable=dict(collections.Counter(i.get('acquisitionStatus') for i in items if i.get('acquisitionStatus') in ['permission_needed','access_blocked'])))))
 print(json.dumps(dict(total=len(result),kinds=dict(collections.Counter(x['preview']['kind'] for x in result))),ensure_ascii=False))
if __name__=='__main__':main()
