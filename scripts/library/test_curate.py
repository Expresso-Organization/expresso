import unittest
from acquire import role_for
from curate import family_name, source_text
from pathlib import Path

class CurationTest(unittest.TestCase):
    def item(self, name):
        return dict(sourceSite='watermelon',sourceItemId=name,title=name.replace('-',' '),categories=['registry:ui'],artifactKind='component')
    def test_state_does_not_mean_statistics(self):
        for name in ['status-picker','use-data-state','use-controlled-state','luminia-luxe-realestate']:
            self.assertNotIn('outcome',role_for(self.item(name))[0])
        self.assertEqual(role_for(self.item('stats-1'))[0],['outcome'])
    def test_domain_collisions_are_not_portfolio_roles(self):
        for name in ['career-1','career-4','timeline','portfolio-dashboard','project-management-dashboard']:
            self.assertEqual(role_for(self.item(name))[0],['supporting-ui'])
    def test_family_retains_semantic_name(self):
        self.assertEqual(family_name('hero-12'),'hero')
        self.assertEqual(family_name('dialog-stack-base'),'dialog-stack')
        self.assertEqual(family_name('project-management-dashboard'),'project-management-dashboard')
    def test_source_path_cannot_escape(self):
        with self.assertRaises(ValueError): source_text(Path('/tmp/registry'),'../private.txt')

if __name__=='__main__': unittest.main()
