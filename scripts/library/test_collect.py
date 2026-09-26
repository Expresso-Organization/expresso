"""수집 중단·중복·변형 기록의 회귀 검사입니다."""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('collect', Path(__file__).with_name('collect.py'))
collect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect)

class InventoryTest(unittest.TestCase):
    def test_urls_keep_content_parameters(self):
        self.assertEqual(collect.canonical('https://EXAMPLE.com/item/?utm_source=x&variant=dark&ref=version2#intro'),
                         'https://example.com/item?variant=dark&ref=version2')
        self.assertIsNone(collect.canonical('javascript:alert(1)'))
        self.assertIsNone(collect.canonical('https://user:secret@example.com'))
        self.assertEqual(collect.canonical('https://example.com/a b.svg'), 'https://example.com/a%20b.svg')

    def test_duplicate_discoveries_preserve_all_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            c = collect.Collector(argparse.Namespace(cache=Path(directory),offline=True,refresh=False))
            source = dict(id='test',kind='icon',rightsStatus='allowed')
            one = c.add(source,'arrow','https://example.com/a','https://example.com/list',category='normal')
            two = c.add(source,'arrow','https://example.com/b','https://example.com/map',category='arrows',title='Arrow')
            self.assertIs(one,two)
            self.assertEqual(len(c.items),1)
            self.assertEqual(one['discoveredFrom'],['https://example.com/list','https://example.com/map'])
            self.assertEqual(one['sourceUrls'],['https://example.com/a','https://example.com/b'])
            self.assertEqual(one['categories'],['normal','arrows'])
            self.assertEqual(one['titleSource'],'listing')

    def test_resume_uses_cached_rate_limit_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            url = 'https://example.com/feed'
            key = collect.hashlib.sha256(url.encode()).hexdigest()[:24]
            path = Path(directory)
            (path/(key+'.json')).write_text(json.dumps(dict(id=key,url=url,status=429,retryAfter='60')))
            c = collect.Collector(argparse.Namespace(cache=path,offline=True,refresh=False))
            self.assertIsNone(c.fetch({'id':'test'},url))
            self.assertEqual(c.receipts[key]['retryAfter'],'60')
            with self.assertRaisesRegex(ValueError,'캐시 없음'):
                c.fetch({'id':'test'},'https://example.com/missing')

if __name__ == '__main__':
    unittest.main()
