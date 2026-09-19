"""Regenera og.jpg (1200x630) desde _dev/og.html.
Uso: /Users/danifcn/mac-vault/.claude/skills/excalidraw-diagram/references/.venv/bin/python _dev/og.py
"""
from playwright.sync_api import sync_playwright
import pathlib
src = pathlib.Path(__file__).parent / "og.html"
out = pathlib.Path(__file__).parent.parent / "og.jpg"
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.goto(src.resolve().as_uri(), wait_until="domcontentloaded")
    pg.wait_for_timeout(4000)
    pg.screenshot(path=str(out), type="jpeg", quality=90)
    b.close()
print("og.jpg listo:", out)
