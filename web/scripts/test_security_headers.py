import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("generate_security_headers.py")
SPEC = importlib.util.spec_from_file_location("security_headers", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT}")
security_headers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(security_headers)


class SecurityHeadersTests(unittest.TestCase):
    def test_hashes_inline_scripts_without_allowing_inline_scripts_globally(self) -> None:
        parser = security_headers.InlineScriptParser()
        parser.feed(
            '<script>globalThis.ready = true;</script>'
            '<script src="/static/app.js"></script>'
        )
        self.assertEqual(len(parser.hashes), 1)
        csp = security_headers.build_csp(parser.hashes, set())
        self.assertIn("script-src 'self' 'sha256-", csp)
        self.assertIn("script-src-attr 'none'", csp)
        self.assertNotIn("'unsafe-inline'", csp)
        self.assertIn("frame-ancestors 'none'", csp)

    def test_generates_route_specific_headers_for_exported_pages(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            export_dir = Path(temporary_directory)
            (export_dir / "index.html").write_text("<main>home</main>", encoding="utf-8")
            nested = export_dir / "restaurants"
            nested.mkdir()
            (nested / "index.html").write_text("<main>menu</main>", encoding="utf-8")

            old_export_dir = security_headers.EXPORT_DIR
            security_headers.EXPORT_DIR = export_dir
            try:
                headers = security_headers.generate_headers(export_dir)
            finally:
                security_headers.EXPORT_DIR = old_export_dir

        self.assertIn("\n/\n", f"\n{headers}\n")
        self.assertIn("\n/restaurants/\n", f"\n{headers}\n")
        self.assertEqual(headers.count("Content-Security-Policy:"), 2)


if __name__ == "__main__":
    unittest.main()
