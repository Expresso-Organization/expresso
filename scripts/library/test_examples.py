import unittest
from verify_examples import snapshot_document

class SnapshotTest(unittest.TestCase):
    def test_snapshot_keeps_runtime_styles_and_removes_scripts(self):
        live='<html><link rel="stylesheet" href="component.css"><style>#demo{padding:12px}</style><body><script src="app.js"></script></body></html>'
        output=snapshot_document('example','<div id="demo">예시<script>alert(1)</script></div>',live)
        self.assertIn('href="component.css"',output)
        self.assertIn('#demo{padding:12px}',output)
        self.assertIn('예시',output)
        self.assertNotIn('<script',output)
        self.assertIn("default-src 'none'",output)
        self.assertNotIn("script-src 'self'",output)

if __name__=='__main__':unittest.main()
