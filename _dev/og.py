"""Regenera og.png (1200x630) para compartir la landing.
Primero captura una preview de la propia pagina y luego la compone con la promesa.
Uso: /Users/danifcn/mac-vault/.claude/skills/excalidraw-diagram/references/.venv/bin/python _dev/og.py
Necesita el servidor local en http://localhost:8211 (o cambia URL).
"""
from playwright.sync_api import sync_playwright
import pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
URL = "http://localhost:8211/"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    # 1) preview de la pagina
    pg = b.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
    pg.goto(URL, wait_until="domcontentloaded")
    pg.wait_for_timeout(7000)
    # Se recorta la mitad inferior: video y boton. Asi la tarjeta ensena la pagina
    # sin arrastrar el titular con las cifras, que un OCR leeria.
    caja = pg.evaluate("""() => {const v=document.querySelector('.vsl-stage').getBoundingClientRect();
        const n=document.querySelector('.cta-note').getBoundingClientRect();
        return {x:0,y:Math.max(0,v.top-26),w:innerWidth,h:(n.bottom+26)-Math.max(0,v.top-26)};}""")
    pg.screenshot(path=str(HERE / "preview.png"),
                  clip={"x":caja["x"],"y":caja["y"],"width":caja["w"],"height":caja["h"]})
    pg.close()
    # 2) composicion final
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.goto((HERE / "og.html").resolve().as_uri(), wait_until="domcontentloaded")
    pg.wait_for_timeout(4500)
    pg.screenshot(path=str(ROOT / "og.png"))
    pg.close()
    b.close()
print("og.png listo:", ROOT / "og.png")
