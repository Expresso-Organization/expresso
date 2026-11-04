import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("hook", Path(__file__).with_name("acme-dns-hook.py"))
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
CONFIG = {"username": "test-user", "password": "test-key", "subdomain": "test-record", "fulldomain": "test-record.auth.acme-dns.io"}


class DnsHookTest(unittest.TestCase):
    def test_only_approved_https_endpoint_receives_key_and_token(self):
        opener = Mock()
        opener.open.return_value = io.StringIO(json.dumps({"txt": "A" * 43}))
        hook.update_token(CONFIG, hook.DOMAIN, "A" * 43, opener)
        req = opener.open.call_args.args[0]
        self.assertEqual(req.full_url, "https://auth.acme-dns.io/update")
        self.assertEqual(req.get_header("X-api-key"), "test-key")
        self.assertEqual(json.loads(req.data), {"subdomain": "test-record", "txt": "A" * 43})
        self.assertIsNone(hook.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example"))

    def test_rejects_other_domains_and_invalid_tokens_before_network(self):
        opener = Mock()
        for domain, token in [("other.example", "A" * 43), (hook.DOMAIN, "bad\nvalue")]:
            with self.assertRaises(ValueError):
                hook.update_token(CONFIG, domain, token, opener)
        opener.open.assert_not_called()


if __name__ == "__main__":
    unittest.main()
