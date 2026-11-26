import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("generate_pages_redirect.py")
SPEC = importlib.util.spec_from_file_location("pages_redirect", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT}")
pages_redirect = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages_redirect)


class PagesRedirectTests(unittest.TestCase):
    def test_redirect_is_static_and_carries_a_safe_fallback_link(self) -> None:
        page = pages_redirect.render_redirect("https://snapp-food.pages.dev/")
        self.assertIn('http-equiv="refresh"', page)
        self.assertIn('<a href="https://snapp-food.pages.dev/">', page)
        self.assertIn('name="robots" content="noindex"', page)

    def test_rejects_non_https_or_ambiguous_targets(self) -> None:
        for target in (
            "http://snapp-food.pages.dev/",
            "javascript:alert(1)",
            "https://user:pass@snapp-food.pages.dev/",
            "https://snapp-food.pages.dev/#fragment",
        ):
            with self.subTest(target=target), self.assertRaises(ValueError):
                pages_redirect.render_redirect(target)

    def test_requires_an_explicit_production_target(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "Set PRODUCTION_WEB_URL"):
                pages_redirect.main()


if __name__ == "__main__":
    unittest.main()
