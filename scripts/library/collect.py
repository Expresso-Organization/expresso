#!/usr/bin/env python3
"""공개 목록을 캐시하고, 출처를 보존한 포털 목록을 만듭니다. Python 3.10+."""
from __future__ import annotations
import argparse
import collections
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import urllib.robotparser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
UA = 'ExpressoReferenceResearch/1.0'
TRACKING = {'fbclid', 'gclid', 'via'}

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')

def canonical(url):
    p = urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.netloc or p.username or p.password:
        return None
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.startswith('utm_') and k not in TRACKING]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), quote(unquote(p.path.rstrip('/') or '/'), safe='/@:+,;=-._~'), urlencode(query), ''))

def humanize(value):
    return re.sub(r'[-_]+', ' ', value).strip() or value

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

class Links(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.links, self.current = [], None
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = [dict(attrs).get('href', ''), '']
    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data
    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            self.current[1] = ' '.join(self.current[1].split())
            self.links.append(self.current)
            self.current = None

class Collector:
    def __init__(self, args):
        self.args = args
        self.cache = args.cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.receipts, self.items, self.sources = {}, {}, []
        self.started = now()
        self.last_request = {}

    def fetch(self, source, url):
        key = hashlib.sha256(url.encode()).hexdigest()[:24]
        meta_path, raw_path = self.cache / (key + '.json'), self.cache / (key + '.body')
        if meta_path.exists() and (not self.args.refresh or key in self.receipts):
            meta = json.loads(meta_path.read_text())
            self.receipts[key] = {**meta, 'source': source['id']}
            if meta['status'] != 200:
                return None
            body = raw_path.read_bytes()
            if hashlib.sha256(body).hexdigest() != meta['sha256']:
                raise ValueError('캐시 해시 불일치: ' + url)
            return body.decode('utf-8-sig')
        if self.args.offline:
            raise ValueError('오프라인 캐시 없음: ' + url)
        host = urlsplit(url).netloc
        # 서버별 요청 간격을 유지하며 실패 요청은 자동 반복하지 않습니다.
        time.sleep(max(0, 0.3 - (time.monotonic() - self.last_request.get(host, 0))))
        meta = dict(id=key, source=source['id'], url=url, fetchedAt=now())
        try:
            with urlopen(Request(url, headers={'User-Agent': UA}), timeout=35) as response:
                body = response.read()
                meta.update(status=response.status, finalUrl=response.url,
                            bytes=len(body), sha256=hashlib.sha256(body).hexdigest(),
                            contentType=response.headers.get('Content-Type'))
                raw_path.write_bytes(body)
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            meta.update(status=getattr(error, 'code', 0), error=str(error))
            headers = getattr(error, 'headers', {})
            meta['retryAfter'] = headers.get('Retry-After')
            body = None
        self.last_request[host] = time.monotonic()
        dump(meta_path, meta)
        self.receipts[key] = meta
        print(f"{source['id']}: {meta['status']} {url}", flush=True)
        return body.decode('utf-8-sig') if body is not None else None

    def add(self, source, item_id, url, discovered, title=None, category=None, kind=None,
            original=None, family=None, variant=None, revision=None, title_source=None):
        url = canonical(url)
        if not url:
            return
        source['discoveryOccurrenceCount'] = source.get('discoveryOccurrenceCount', 0) + 1
        stable_id = source['id'] + '-' + hashlib.sha256(item_id.encode()).hexdigest()[:16]
        entry = self.items.get(stable_id)
        if entry is None:
            entry = dict(id=stable_id, sourceSite=source['id'], sourceItemId=item_id,
                         title=title or humanize(item_id.split('/')[-1]),
                         titleSource=title_source or ('listing' if title else 'identifier'),
                         canonicalUrl=url, sourceUrls=[url], originalUrl=canonical(original) if original else None,
                         artifactKind=kind or source['kind'], categories=[],
                         roles=[source['role']] if source.get('role') else [],
                         discoveredFrom=[], familyId=family, variant=variant,
                         sourceRevision=revision, collectionStatus='discovered',
                         rightsStatus=source['rightsStatus'], reviewStatus='unreviewed',
                         integrationStatus='not_started', preview=None)
            self.items[stable_id] = entry
        elif title and entry['titleSource'] == 'identifier':
            entry.update(title=title, titleSource=title_source or 'listing')
        if url not in entry['sourceUrls']:
            entry['sourceUrls'].append(url)
        if original and not entry['originalUrl']:
            entry['originalUrl'] = canonical(original)
        if category and category not in entry['categories']:
            entry['categories'].append(category)
        if discovered not in entry['discoveredFrom']:
            entry['discoveredFrom'].append(discovered)
        return entry

    def robots(self, source):
        url = urljoin(source['url'], '/robots.txt')
        raw = self.fetch(source, url)
        parser = urllib.robotparser.RobotFileParser()
        if raw:
            parser.parse(raw.splitlines())
        else:
            parser.parse(['User-agent: *', 'Allow: /'])
            source['nextActions'].append(dict(kind='coverage', url=url,
                reason='robots 응답을 확보하지 못했습니다. 공개 진입점만 확인했습니다.'))
        return parser, re.findall(r'(?im)^Sitemap:\s*(\S+)', raw or '')

    def sitemap(self, source, url, robot, visited):
        if url in visited:
            return []
        visited.add(url)
        if not robot.can_fetch(UA, url):
            source['nextActions'].append(dict(kind='access', url=url, reason='robots 수집 제한'))
            return []
        raw = self.fetch(source, url)
        if not raw:
            return []
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            source['nextActions'].append(dict(kind='parse', url=url, reason='XML 형식 확인 필요'))
            return []
        locations = [e.text for e in root.iter() if e.tag.split('}')[-1] == 'loc' and e.text]
        if root.tag.split('}')[-1] == 'sitemapindex':
            result = []
            for child in locations:
                # 외부 사이트맵은 자동 방문하지 않고 검토 대상으로 남깁니다.
                if urlsplit(child).netloc == urlsplit(url).netloc:
                    result.extend(self.sitemap(source, child, robot, visited))
                else:
                    source['nextActions'].append(dict(kind='coverage', url=child, reason='외부 사이트맵 확인 필요'))
            return result
        source['sitemapPages'].append(dict(url=url, listedUrls=len(locations)))
        return [(value, '', url) for value in locations]

    def generic(self, source):
        robot, maps = self.robots(source)
        entry = source['entry']
        raw = self.fetch(source, entry) if robot.can_fetch(UA, entry) else None
        links = [(urljoin(entry, u), title, entry) for u, title in Links(raw or '').links]
        for sitemap in maps:
            links.extend(self.sitemap(source, sitemap, robot, set()))
        pattern = re.compile(source['pattern'])
        categories = {}
        for url, title, found in links:
            url = canonical(url)
            if not url:
                continue
            path = urlsplit(url).path.rstrip('/')
            if urlsplit(url).netloc.removeprefix('www.') != urlsplit(source['url']).netloc.removeprefix('www.'):
                continue
            if source.get('categoryPattern') and re.search(source['categoryPattern'], (path or '/') + ('?' + urlsplit(url).query if urlsplit(url).query else '')):
                categories[url] = dict(url=url, label=humanize(dict(parse_qsl(urlsplit(url).query)).get('cat') or path.split('/')[-1]), state='discovered')
            if not pattern.fullmatch(path):
                continue
            if source['id'] == '60fps' and path.split('/')[-1] in {'watch','filter','category','tag'}:
                continue
            item_id = path.lstrip('/')
            category = path.split('/')[1]
            kind = source['kind']
            if source['id'] == 'codedvisuals':
                category = path.split('/')[2]
            if source['id'] == '60fps' and category in ('apps','appsites','glossary'):
                kind = 'reference'
            # 카드 설명 원문을 가져오지 않고 식별자에서 생성한 이름을 명시합니다.
            if source['id'] in ('motion','codedvisuals','60fps') or not title or len(title) > 90 or title in ("Editor's Choice", 'View', 'Visit'):
                title = None
            if title and len(title) % 2 == 0 and title[:len(title)//2] == title[len(title)//2:]:
                title = title[:len(title)//2]
            self.add(source, item_id, url, found, title=title, category=category, kind=kind)
        source['categories'] = list(categories.values())
        source['coverageState'] = 'snapshot_complete' if source['sitemapPages'] else ('partial' if raw else 'blocked')
        source['method'] = 'sitemap + public links' if source['sitemapPages'] else 'public links'
        if categories:
            source['nextActions'].append(dict(kind='classification', url=source['url'],
                reason=f'분류 주소 {len(categories)}개를 발견했습니다. 항목별 소속과 사이트맵 밖 추가 항목은 분류 목록에서 확인해야 합니다.'))
        if source['id'] in ('supahero','unsection'):
            source['coverageState'] = 'partial'
            source['nextActions'].append(dict(kind='coverage', url=entry,
                reason='전체 총수·추가 페이지 여부를 확인하고 공개 목록과 대조해야 합니다.'))
        for url, title, found in links:
            if re.search(r'(?:_page|page)=\d+', url) and urlsplit(url).netloc == urlsplit(entry).netloc:
                source['nextActions'].append(dict(kind='pagination', url=url,
                    reason='사이트맵 합집합에 없는 추가 항목과 분류를 다음 목록 페이지에서 대조합니다.'))
        # 목록에 명시된 원본 링크는 인접한 항목에만 연결합니다.
        if source['id'] in ('footer','cta','404') and raw:
            previous = None
            for href, label in Links(raw).links:
                u = canonical(urljoin(entry, href))
                if not u:
                    continue
                if pattern.fullmatch(urlsplit(u).path):
                    previous = source['id'] + '-' + hashlib.sha256(urlsplit(u).path.lstrip('/').encode()).hexdigest()[:16]
                elif previous and urlsplit(u).netloc != urlsplit(entry).netloc:
                    if previous in self.items:
                        self.items[previous]['originalUrl'] = u
                    previous = None

    def repository(self, source, repo):
        commit_raw = self.fetch(source, f'https://api.github.com/repos/{repo}/commits/main')
        if not commit_raw:
            source.update(coverageState='blocked', method='GitHub tree')
            return
        revision = json.loads(commit_raw)['sha']
        tree_url = f'https://api.github.com/repos/{repo}/git/trees/{revision}?recursive=1'
        raw = self.fetch(source, tree_url)
        if not raw:
            source.update(coverageState='blocked', method='GitHub tree')
            return
        tree = json.loads(raw)
        source['treeSha'] = tree['sha']
        source['licenseUrl'] = f'https://github.com/{repo}/blob/{revision}/LICENSE'
        source.update(revision=revision, method='GitHub tree', coverageState='partial' if tree.get('truncated') else 'snapshot_complete')
        if tree.get('truncated'):
            source['nextActions'].append(dict(kind='coverage', url=tree_url, reason='GitHub tree가 잘렸습니다. 하위 tree 탐색 필요'))
        for file in tree['tree']:
            path = file['path']
            if file['type'] != 'blob':
                continue
            kind = source['kind']
            family, variant, category = None, None, None
            if source['id'] == 'rune':
                parts = path.split('/')
                if len(parts) not in (3, 4) or parts[0] != 'public' or not path.endswith('.svg') or parts[1] == 'sprites':
                    continue
                variant = parts[1]
                category = parts[2] if len(parts) == 4 else 'uncategorized'
                family = 'rune/' + (category if len(parts) == 4 else variant) + '/' + Path(path).stem
                title = humanize(Path(path).stem)
            else:
                base = 'skills/diagram-design/'
                if not path.startswith(base):
                    continue
                relative = path[len(base):]
                if relative.startswith('assets/example-') and path.endswith('.html'):
                    stem = Path(path).stem.removeprefix('example-')
                    family = 'diagram/' + re.sub(r'-(dark|full)$', '', stem)
                    variant = 'dark' if stem.endswith('-dark') else ('full' if stem.endswith('-full') else 'default')
                    category, title = 'example', humanize(stem)
                elif relative.startswith(('references/', 'scripts/')) or relative == 'SKILL.md':
                    kind, category, title = 'reference', relative.split('/')[0], humanize(Path(path).stem)
                else:
                    continue
            self.add(source, path, f'https://github.com/{repo}/blob/{revision}/{path}', tree_url,
                     title, category, kind, family=family, variant=variant, revision=revision, title_source='filename')

    def watermelon(self, source):
        repo = 'WatermelonCorp/watermellon-registry'
        revision_url = f'https://api.github.com/repos/{repo}/commits/main'
        raw = self.fetch(source, revision_url)
        if not raw:
            source.update(coverageState='blocked', method='registry.json')
            return
        sha = json.loads(raw)['sha']
        registry_url = f'https://raw.githubusercontent.com/{repo}/{sha}/registry.json'
        raw = self.fetch(source, registry_url)
        if not raw:
            source.update(coverageState='blocked', method='registry.json')
            return
        for item in json.loads(raw)['items']:
            self.add(source, item['name'], registry_url, registry_url, title=item.get('title'),
                     category=item.get('type'), revision=sha,
                     kind='reference' if item.get('type') in ('registry:hook', 'registry:lib') else 'component')
        robot, maps = self.robots(source)
        for sitemap in maps:
            for url, title, found in self.sitemap(source, sitemap, robot, set()):
                path = urlsplit(url).path.strip('/').split('/')
                if len(path) != 2 or path[0] not in ('block','components','animated-components','dashboard','showcase','template'):
                    continue
                item = self.add(source, path[1], url, found, category=path[0], revision=sha)
                item['canonicalUrl'] = canonical(url)
        source['licenseUrl'] = f'https://github.com/{repo}/blob/{sha}/LICENSE'
        source.update(revision=sha, method='pinned registry.json + sitemap', coverageState='partial')
        source['nextActions'].append(dict(kind='coverage', url='https://ui.watermelon.sh/api/v1/catalog/entries',
            reason='선행 조사에서 API 접근이 403이었습니다. registry·사이트맵 합집합과 API 종류별 목록의 차이는 접근이 허용되면 대조합니다.'))

    def shoogle(self, source):
        robot, _ = self.robots(source)
        queue, seen = [source['entry']], set()
        while queue:
            page = queue.pop(0)
            if page in seen:
                continue
            seen.add(page)
            if not robot.can_fetch(UA, page):
                source['nextActions'].append(dict(kind='access', url=page, reason='robots 수집 제한'))
                continue
            raw = self.fetch(source, page)
            if not raw:
                continue
            for href, label in Links(raw).links:
                url = canonical(urljoin(page, href))
                if not url:
                    continue
                if label.startswith('@') and urlsplit(url).netloc != 'shoogle.dev':
                    self.add(source, label.split()[0], url, page, title=label.split()[0], category='registry', original=url)
                if urlsplit(url).netloc == 'shoogle.dev' and re.fullmatch(r'/directory/page/\d+', urlsplit(url).path):
                    if url not in seen and url not in queue:
                        queue.append(url)
        source.update(method='Directory pagination', coverageState='snapshot_complete', pagesVisited=len(seen))
        source['nextActions'].append(dict(kind='expansion', url=source['entry'], reason='발견한 공급자별 공식 registry와 라이선스를 이어서 확인합니다. Directory 밖 검색 결과는 미조사입니다.'))

    def bento(self, source):
        self.robots(source)
        raw = self.fetch(source, source['entry'])
        if not raw:
            source.update(coverageState='blocked', method='public page data')
            return
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw, re.S)
        if not match:
            raise ValueError('Bento 공개 페이지 데이터 형식 변경')
        data = json.loads(match[1])
        for shot in data['props']['pageProps']['shots']:
            self.add(source, shot['id'], source['url'], source['entry'], shot['title'],
                     shot['category'], original=shot.get('sourceLink'), revision=data.get('buildId'))
        source.update(method='public __NEXT_DATA__.props.pageProps.shots', coverageState='partial', revision=data.get('buildId'))
        source['nextActions'].append(dict(kind='coverage', url=source['entry'], reason='홈페이지 응답 밖 추가 목록과 개별 상세 URL은 확인되지 않았습니다.'))

    def spells(self, source):
        raw = self.fetch(source, source['entry'])
        if not raw:
            source.update(method='official RSS', coverageState='blocked')
            source['nextActions'].append(dict(kind='access', url=source['url'], reason='HTTP 429 이후 공개 RSS에서도 목록을 확보하지 못했습니다. 서버 안내에 따라 후속 실행에서 재확인합니다.'))
            return
        root = ET.fromstring(raw)
        for item in root.findall('.//item'):
            url = item.findtext('link')
            if url:
                self.add(source, urlsplit(url).path, url, source['entry'], title=item.findtext('title'), category='interaction')
        source.update(method='official RSS', coverageState='partial')
        source['nextActions'].append(dict(kind='coverage', url=source['url'], reason='RSS에 실린 범위만 확보했습니다. 전체 갤러리·태그별 목록과 대조해야 합니다.'))

    def run(self):
        for config in json.loads((Path(__file__).with_name('sources.json')).read_text()):
            source = {**config, 'categories':[], 'nextActions':[], 'sitemapPages':[]}
            try:
                match source['id']:
                    case 'origin':
                        source.update(method='permission review', coverageState='permission_needed')
                        source['nextActions'].append(dict(kind='permission', url=source['licenseUrl'], reason=source['note']))
                    case 'watermelon': self.watermelon(source)
                    case 'diagram': self.repository(source, 'cathrynlavery/diagram-design')
                    case 'rune': self.repository(source, 'Nexvyn/runeicons')
                    case 'shoogle': self.shoogle(source)
                    case 'bento': self.bento(source)
                    case 'spells': self.spells(source)
                    case _: self.generic(source)
            except (ValueError, KeyError, ET.ParseError) as error:
                if self.args.offline:
                    raise
                source.update(coverageState='partial', parseError=str(error))
                source['nextActions'].append(dict(kind='parse', url=source['url'], reason=str(error)))
            receipts = [r for r in self.receipts.values() if r['source'] == source['id']]
            source['requestIds'] = [r['id'] for r in receipts]
            source['fetchedAt'] = max((r['fetchedAt'] for r in receipts), default=None)
            for receipt in receipts:
                if receipt['status'] != 200:
                    source['nextActions'].append(dict(kind='fetch', url=receipt['url'], reason=f"HTTP {receipt['status']}: {receipt.get('error', '')}"))
                    if source.get('coverageState') == 'snapshot_complete':
                        source['coverageState'] = 'partial'
            items = [i for i in self.items.values() if i['sourceSite'] == source['id']]
            source['discoveredCount'] = len(items)
            source['mergedOccurrences'] = source.get('discoveryOccurrenceCount', 0) - len(items)
            if not items and source.get('coverageState') == 'snapshot_complete':
                source['coverageState'] = 'partial'
                source['nextActions'].append(dict(kind='parse', url=source['url'], reason='목록 응답에서 항목을 추출하지 못했습니다. 파서와 제공 범위를 재확인합니다.'))
            source['kindCounts'] = dict(collections.Counter(i['artifactKind'] for i in items))
            source['familyCount'] = len({i['familyId'] for i in items if i['familyId']})
            for key in ('pattern','categoryPattern','entry','role','kind'):
                source.pop(key, None)
            self.sources.append(source)
        # 원본 URL 일치는 같은 사이트를 참고한다는 관계입니다. 동일 컴포넌트로 단정하지 않습니다.
        originals = collections.defaultdict(list)
        for item in self.items.values():
            if item['originalUrl']:
                originals[item['originalUrl']].append(item['id'])
        relations = [dict(type='same_original_url', url=u, itemIds=ids)
                     for u, ids in originals.items() if len(ids) > 1]
        source_order = {source['id']: index for index, source in enumerate(self.sources)}
        catalog = dict(schemaVersion=1, runId=self.args.run_id, generatedAt=max((r['fetchedAt'] for r in self.receipts.values()), default=self.started),
                       sources=self.sources, items=sorted(self.items.values(), key=lambda i:(source_order[i['sourceSite']],i['sourceItemId'])), relations=relations)
        # 공개 목록은 항목당 한 줄로 저장해 검토 가능한 diff와 전송 크기를 유지합니다.
        self.args.output.mkdir(parents=True, exist_ok=True)
        encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        fields = []
        for key, value in catalog.items():
            encoded = '[\n' + ',\n'.join(encode(item) for item in value) + '\n]' if isinstance(value, list) else encode(value)
            fields.append(encode(key) + ':' + encoded)
        (self.args.output / 'catalog.json').write_text('{\n' + ',\n'.join(fields) + '\n}\n')
        token_source = ROOT / 'services/web/src/styles/tokens.css'
        (self.args.output / 'tokens.css').write_bytes(token_source.read_bytes())
        dump(self.args.output / 'collection-run.json', dict(schemaVersion=1, runId=self.args.run_id,
            userAgent=UA, python=sys.version.split()[0], requests=list(self.receipts.values())))
        print(json.dumps({s['id']:s['discoveredCount'] for s in self.sources},ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT/'artifacts/portfolio-library/cache')
    parser.add_argument('--output', type=Path, default=ROOT/'docs/library')
    parser.add_argument('--run-id', default='2026-09-22-stage-1')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--offline', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    Collector(parser.parse_args()).run()
