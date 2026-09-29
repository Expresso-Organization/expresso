import unittest
from acquire import Page,media_for,svg_safe,static_diagram
class PreviewExtractionTest(unittest.TestCase):
 def test_missing_image_does_not_use_the_detail_page_as_image(self):
  page=Page('<h1>Example</h1>')
  url,kind=media_for(page,dict(sourceSite='cta',canonicalUrl='https://example.com/cta/test'))
  self.assertIsNone(url)
 def test_navbar_uses_the_case_image_instead_of_a_sponsor(self):
  page=Page('<img src="https://cdn.example.com/ad.png" class="ad-block"><img src="https://cdn.example.com/case.avif" class="individual-image">')
  url,kind=media_for(page,dict(sourceSite='navbar',canonicalUrl='https://example.com/navbar/test'))
  self.assertEqual(url,'https://cdn.example.com/case.avif')
 def test_active_svg_is_rejected(self):
  self.assertTrue(svg_safe('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'))
  self.assertFalse(svg_safe('<svg><script>alert(1)</script></svg>'))
  self.assertFalse(svg_safe('<svg onload="alert(1)"></svg>'))
 def test_diagram_preview_removes_scripts_and_external_styles(self):
  output=static_diagram('<html><head><link href="https://example.com/a.css"></head><body><script>alert(1)</script><svg></svg></body></html>')
  self.assertNotIn('<script',output);self.assertNotIn('<link',output);self.assertIn('Content-Security-Policy',output)
if __name__=='__main__':unittest.main()
