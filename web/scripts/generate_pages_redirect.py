from __future__ import annotations

import html
import os
from pathlib import Path
from urllib.parse import urlsplit


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "redirect-out"


def render_redirect(target: str) -> str:
    parsed = urlsplit(target)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValueError("The production site URL must be a valid HTTPS URL without credentials or a fragment")

    safe_target = html.escape(target, quote=True)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0; url={safe_target}">
    <link rel="canonical" href="{safe_target}">
    <title>Snapfood is moving</title>
  </head>
  <body>
    <main>
      <h1>Snapfood is moving</h1>
      <p>The secure ordering site is hosted at its production address.</p>
      <p><a href="{safe_target}">Continue to Snapfood</a></p>
    </main>
  </body>
</html>
"""


def main() -> None:
    target = os.environ.get("PRODUCTION_WEB_URL")
    if not target:
        raise ValueError("Set PRODUCTION_WEB_URL to the confirmed HTTPS production URL")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "index.html").write_text(render_redirect(target), encoding="utf-8")
    (OUTPUT_DIR / "404.html").write_text(render_redirect(target), encoding="utf-8")
    print(f"Generated GitHub Pages redirect to {target}")


if __name__ == "__main__":
    main()
