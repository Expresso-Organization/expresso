#!/usr/bin/env python3
"""브라우저에서 렌더링한 예제의 정적 카드와 검사 결과를 로컬에 기록합니다."""
import hashlib,http.server,json,re,threading,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/library/previews/watermelon'
NAMES={x['name'] for x in json.loads((OUT/'build-results.json').read_text()) if x['status']=='built'}
lock=threading.Lock()
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
 def do_POST(self):
  if self.path!='/__preview-result' or self.headers.get('Origin')!='http://127.0.0.1:8918':self.send_error(403);return
  length=int(self.headers.get('Content-Length','0'))
  if not 0<length<4*1024*1024:self.send_error(400);return
  value=json.loads(self.rfile.read(length));name=value.get('id')
  if name not in NAMES or value.get('status') not in ('ready','empty','error'):self.send_error(400);return
  with lock:
   path=OUT/'verification.json';data=json.loads(path.read_text()) if path.exists() else {'method':'browser_render_dom_capture','viewport':{'width':1280,'height':880},'results':{}}
   result={k:value[k] for k in ('status','reason') if k in value};result['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
   if value['status']=='ready':
    body=value.get('html','');body=re.sub(r'<script\b[^>]*>.*?</script>','',body,flags=re.S|re.I)
    csp="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'none'; base-uri 'none'"
    document=f'<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="{csp}"><title>{name} · 정적 예제</title><link rel="stylesheet" href="preview.css"><style>*,::before,::after{{animation-play-state:paused!important;transition:none!important}}</style><body>{body}</body></html>'
    target=OUT/(name+'.static.html');target.write_text(document);result['snapshotSha256']=hashlib.sha256(document.encode()).hexdigest()
   data['results'][name]=result;path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  self.send_response(200);self.end_headers();self.wfile.write(b'OK')
if __name__=='__main__':http.server.ThreadingHTTPServer(('127.0.0.1',8918),Handler).serve_forever()
