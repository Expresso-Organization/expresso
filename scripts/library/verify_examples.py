#!/usr/bin/env python3
"""격리 iframe에서 실행한 예제의 결과와 정적 카드를 보존합니다."""
import datetime,hashlib,http.server,json,re,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/library/previews/examples'
lock=threading.Lock()
def snapshot_document(key,body,live):
 body=re.sub(r'<script\b[^>]*>.*?</script>','',body,flags=re.S|re.I)
 # 실행 문서의 스타일을 그대로 적용하고 스크립트 실행 권한은 제거합니다.
 head=live.split('<body>',1)[0]
 styles=''.join(re.findall(r'<link\s+rel="stylesheet"[^>]*>|<style\b[^>]*>.*?</style>',head,flags=re.S|re.I))
 csp="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'none'; base-uri 'none'"
 return f'<!doctype html><html lang="ko" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="{csp}"><title>{key} · 정적 실행 화면</title>{styles}<style>*,::before,::after{{animation-play-state:paused!important;transition:none!important}}</style><body>{body}</body></html>'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
 def do_POST(self):
  if self.path!='/__example-result' or self.headers.get('Origin')!='http://127.0.0.1:8919':self.send_error(403);return
  length=int(self.headers.get('Content-Length','0'))
  if not 0<length<8*1024*1024:self.send_error(400);return
  value=json.loads(self.rfile.read(length));key=value.get('id')
  allowed={x['id'] for x in json.loads((OUT/'build-results.json').read_text()) if x['status']=='built'}
  if key not in allowed or value.get('status') not in ('ready','empty','error','timeout'):self.send_error(400);return
  with lock:
   path=OUT/'verification.json';data=json.loads(path.read_text()) if path.exists() else {'method':'isolated_browser_dom_capture','results':{}}
   result={k:value[k] for k in ('status','reason') if k in value};result['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
   if value['status']=='ready':
    document=snapshot_document(key,value.get('html',''),(OUT/(key+'.html')).read_text())
    (OUT/(key+'.static.html')).write_text(document);result['snapshotSha256']=hashlib.sha256(document.encode()).hexdigest()
   data['results'][key]=result;path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  self.send_response(200);self.end_headers();self.wfile.write(b'OK')
if __name__=='__main__':http.server.ThreadingHTTPServer(('127.0.0.1',8919),Handler).serve_forever()
