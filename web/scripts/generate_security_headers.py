from __future__ import annotations

import base64
import hashlib
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


EXPORT_DIR = Path(__file__).resolve().parents[1] / "out"


class InlineScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.hashes: set[str] = set()
        self._capturing = False
        self._parts: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag.lower() != "script":
            return
        self._capturing = not any(name.lower() == "src" for name, _ in attrs)
        self._parts = []

    def handle_data(self, data: str) -> None:
        if self._capturing:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "script":
            return
        if self._capturing:
            source = "".join(self._parts).encode("utf-8")
            digest = base64.b64encode(hashlib.sha256(source).digest()).decode("ascii")
            self.hashes.add(f"'sha256-{digest}'")
        self._capturing = False
        self._parts = []


def trusted_origin(name: str) -> str | None:
    value = os.environ.get(name)
    if not value:
        return None

    parsed = urlsplit(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise ValueError(f"{name} must be an absolute HTTP(S) URL")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError(f"{name} must use HTTPS outside localhost")
    return f"{parsed.scheme}://{parsed.netloc}"


def page_path(html_file: Path, export_dir: Path = EXPORT_DIR) -> str:
    relative = html_file.relative_to(export_dir).as_posix()
    if relative == "index.html":
        return "/"
    if relative.endswith("/index.html"):
        return f"/{relative.removesuffix('index.html')}"
    return f"/{relative}"


def build_csp(hashes: set[str], connect_origins: set[str]) -> str:
    script_sources = " ".join(["'self'", *sorted(hashes)])
    connect_sources = " ".join(["'self'", *sorted(connect_origins)])
    return "; ".join(
        [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            f"script-src {script_sources}",
            "script-src-attr 'none'",
            "style-src 'self'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            f"connect-src {connect_sources}",
            "frame-src 'none'",
            "upgrade-insecure-requests",
        ]
    )


def generate_headers(export_dir: Path = EXPORT_DIR) -> str:
    if not export_dir.is_dir():
        raise FileNotFoundError(f"Static export directory is missing: {export_dir}")

    connect_origins = {
        origin
        for name in ("NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_OIDC_AUTHORITY")
        if (origin := trusted_origin(name))
    }

    blocks: list[str] = []
    for html_file in sorted(export_dir.rglob("*.html")):
        parser = InlineScriptParser()
        parser.feed(html_file.read_text(encoding="utf-8"))
        path = page_path(html_file, export_dir)
        csp = build_csp(parser.hashes, connect_origins)
        if len(f"  Content-Security-Policy: {csp}") > 2000:
            raise ValueError(f"CSP header exceeds Cloudflare Pages' line limit for {path}")

        blocks.extend(
            [
                path,
                "  Content-Security-Policy: " + csp,
                "  Referrer-Policy: strict-origin-when-cross-origin",
                "  X-Content-Type-Options: nosniff",
                "  X-Frame-Options: DENY",
                "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
                "",
            ]
        )

    if not blocks:
        raise ValueError(f"No static HTML pages found in {export_dir}")
    return "\n".join(blocks)


def main() -> None:
    output = EXPORT_DIR / "_headers"
    output.write_text(generate_headers(), encoding="utf-8")
    print(f"Generated response security headers for static pages in {output}")


if __name__ == "__main__":
    main()
