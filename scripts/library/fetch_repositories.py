#!/usr/bin/env python3
"""고정된 공개 저장소의 원본과 해시를 확보합니다. 다운로드한 코드를 실행하지 않습니다."""
import urllib.request,tarfile,io,json,hashlib,datetime,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
base=ROOT/'artifacts/portfolio-library/stage-2/repos'
base.mkdir(parents=True,exist_ok=True)
jobs=[('watermelon','WatermelonCorp/watermellon-registry','0099addd50a985bf53bdb81140ab4b72fc0668ce'),('rune','Nexvyn/runeicons','f649e467d1bc9f272aae3f8daa329d4c924e7340'),('diagram','cathrynlavery/diagram-design','dc1ace47b99a419e42d01a03cb6ace5346efa8ae')]
def get(job):
 name,repo,sha=job
 receipt_path=base/(name+'.receipt.json');archive_path=base/(name+'.tar.gz')
 if receipt_path.exists() and archive_path.exists() and (base/name/'LICENSE').exists():
  receipt=json.loads(receipt_path.read_text())
  if hashlib.sha256(archive_path.read_bytes()).hexdigest()!=receipt['sha256']:raise ValueError('원본 archive 해시 불일치')
  return receipt
 url=f'https://codeload.github.com/{repo}/tar.gz/{sha}';dest=base/name;dest.mkdir(exist_ok=True)
 req=urllib.request.Request(url,headers={'User-Agent':'ExpressoReferenceResearch/1.0'})
 with urllib.request.urlopen(req,timeout=90) as r:b=r.read()
 (base/(name+'.tar.gz')).write_bytes(b)
 with tarfile.open(fileobj=io.BytesIO(b)) as archive:
  for m in archive.getmembers():
   if not m.isfile():continue
   rel=Path(*Path(m.name).parts[1:])
   if rel.is_absolute() or '..' in rel.parts:raise ValueError(m.name)
   target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile(m).read())
 receipt=dict(source=name,url=url,sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),revision=sha)
 (base/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2));return receipt
for r in concurrent.futures.ThreadPoolExecutor(max_workers=3).map(get,jobs):print(json.dumps(r),flush=True)
