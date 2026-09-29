#!/usr/bin/env python3
"""공개 상세 페이지를 제한된 동시 요청으로 읽고 원문은 로컬 캐시에만 보존합니다."""
from __future__ import annotations
import argparse,collections,concurrent.futures,datetime as dt,gzip,hashlib,json,re,threading,time
from pathlib import Path
from urllib.parse import urlsplit,urljoin
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
import urllib.robotparser
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'artifacts/portfolio-library/stage-2/details'
UA='ExpressoReferenceResearch/1.0'
SITES={'navbar','supahero','404','footer','cta','unsection','60fps'}

class Fetcher:
    def __init__(self,cache=CACHE):
        self.cache=cache;cache.mkdir(parents=True,exist_ok=True)
        self.lock=threading.Lock()
        self.next_time={};self.blocked={}
    def fetch(self,url,site):
        key=hashlib.sha256(url.encode()).hexdigest()[:24];meta=self.cache/(key+'.json');body=self.cache/(key+'.gz')
        if meta.exists():return json.loads(meta.read_text())
        host=urlsplit(url).netloc
        with self.lock:
            if host in self.blocked:
                return {'url':url,'source':site,'status':'host_blocked','reason':self.blocked[host]}
            delay=max(0,self.next_time.get(host,0)-time.monotonic());self.next_time[host]=time.monotonic()+delay+.4
        if delay:time.sleep(delay)
        with self.lock:
            if host in self.blocked:return {'url':url,'source':site,'status':'host_blocked','reason':self.blocked[host]}
        receipt={'url':url,'source':site,'fetchedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'cacheKey':key}
        try:
            with urlopen(Request(url,headers={'User-Agent':UA,'Accept-Encoding':'gzip'}),timeout=25) as response:
                raw=response.read(16*1024*1024+1)
                if len(raw)>16*1024*1024:raise ValueError('응답 크기 상한 초과')
                if response.headers.get('Content-Encoding')=='gzip':raw=gzip.decompress(raw)
                receipt.update(status=response.status,finalUrl=response.url,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),contentType=response.headers.get('Content-Type'))
                body.write_bytes(gzip.compress(raw))
        except (HTTPError,URLError,TimeoutError,OSError,ValueError) as error:
            receipt.update(status=getattr(error,'code',0),reason=str(error),retryAfter=getattr(error,'headers',{}).get('Retry-After'))
            if receipt['status'] in (401,403,429):
                with self.lock:self.blocked[host]=f"HTTP {receipt['status']} 응답 이후 이 호스트의 추가 요청 중단"
        meta.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
        return receipt

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--sites',nargs='+',default=sorted(SITES));parser.add_argument('--workers',type=int,default=8);args=parser.parse_args()
    catalog=json.loads((ROOT/'docs/library/catalog.json').read_text());fetcher=Fetcher();groups={}
    for source in catalog['sources']:
        if source['id'] not in args.sites:continue
        # 1단계에서 실제 읽은 robots를 재사용합니다. 404는 공개 페이지의 robots 부재로 기록합니다.
        robot_url=urljoin(source['url'],'/robots.txt');key=hashlib.sha256(robot_url.encode()).hexdigest()[:24]
        robot_path=ROOT/'artifacts/portfolio-library/cache'/f'{key}.body'
        robot=urllib.robotparser.RobotFileParser();robot.parse(robot_path.read_text().splitlines() if robot_path.exists() else ['User-agent: *','Allow: /'])
        groups[source['id']]=[(i['canonicalUrl'],source['id']) for i in catalog['items'] if i['sourceSite']==source['id'] and robot.can_fetch(UA,i['canonicalUrl'])]
    # 공급자를 교차 배치해 한 호스트의 지연이 다른 사이트 작업을 막지 않게 합니다.
    jobs=[]
    while any(groups.values()):
        for group in groups.values():
            if group:jobs.append(group.pop(0))
    receipts=[];counter=collections.Counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for n,result in enumerate(pool.map(lambda job:fetcher.fetch(*job),jobs),1):
            receipts.append(result);counter[str(result['status'])]+=1
            if n%50==0 or n==len(jobs):
                print(n,len(jobs),dict(counter),flush=True)
                (CACHE.parent/'detail-run.json').write_text(json.dumps({'requests':receipts,'userAgent':UA},ensure_ascii=False,indent=2)+'\n')
    print('DONE',dict(counter),flush=True)
if __name__=='__main__':main()
