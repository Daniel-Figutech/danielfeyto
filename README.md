# danielfeyto.com

Hero de optin, una sola pantalla, sin header. Estático: `index.html` autocontenido (CSS y JS dentro).

## Despliegue

Cloudflare Pages conectado a este repo.

- Build command: *(ninguno)*
- Build output directory: `/` (raíz)
- Cada `git push` a `main` redespliega.

## Qué hay que tocar antes de dar tráfico

| Qué | Dónde | Ahora mismo |
|---|---|---|
| Destino del CTA | `<a class="cta" href="#">` | `#` — **pendiente**: URL del formulario o del calendario |
| Vídeo de la VSL | `#vsl-frame` → `src` | Bunny `583428 / 5c6e7217-086b-44c4-a8d2-9f5132fced85` (provisional) |

Para cambiar el vídeo basta con sustituir la librería y el GUID dentro de la URL del embed. Mantén
`autoplay=true&muted=true`: los navegadores bloquean el autoplay con sonido, y por eso existe la
capa de "toca para activar el sonido", que además rebobina a 0 para no perder los primeros segundos.

## Un ajuste recomendado en Bunny

El player de Bunny pinta sus propios controles al pausar o al pasar el ratón, y compiten con la barra
de retención. Ahora mismo los tapa una franja degradada de 52 px al pie del vídeo, verificada en
navegador. La solución limpia es apagarlos en origen: **Bunny → Stream → librería 583428 → Player →
quitar "Show Controls"**. Hecho eso, se puede bajar `.vsl-bar` a 10-12 px y el vídeo gana alto útil.

## Decisiones de diseño

- **Color de marca**: oro "flow" tomado de daddyespresso.com —
  `linear-gradient(90deg,#C9953A,#FAD26B 50%,#C49329 86%)` recortado al texto, con un barrido de
  brillo `#FFE28A` de 5 s. Vive en `.flow`.
- **Tipografía display**: Jersey 25 (pixel). Se eligió midiendo: Pixelify Sans y Tiny5 rompen el
  glifo `€` y confunden el `5` con `S`, y el titular es una promesa de dinero. Jersey 25 renderiza
  `10.000€ a 50.000€`, `ñ` e `í` sin ambigüedad.
- **Texto**: Miriam Libre.
- **Recuadro luminoso** de "copia y pega": sistema de capas de la skill `build-glow-text-highlight`
  (base, lavado, reflejo superior, cresta de 1px, borde, doble bloom), adaptado a base clara dorada
  con tinta oscura, que es lo que pide esa misma skill para superficies claras.
- **Barra de retención** del vídeo: sigue el tiempo real pero deforma cómo se muestra, con una curva
  cóncava. A los 5 s ya va por el 18%. Los puntos de control están en `PTS` dentro del script.
- **Iconos**: dibujados sobre rejilla de píxeles (9×9 la flecha, 21×21 el altavoz), al estilo del set
  Pixel de Streamline (CC BY 4.0) que sirvió de referencia.
- **Entrada**: un solo primitivo, `slide in up` con desenfoque que se resuelve a mitad del recorrido
  (no al final, que se vería como un enfoque tardío). Escalonado en seis tiempos; el botón remata con
  una curva propia, más larga, para que su halo florezca al aterrizar.

## Imagen social

`og.jpg` (1200×630) se regenera desde `_dev/og.html`:

```
/Users/danifcn/mac-vault/.claude/skills/excalidraw-diagram/references/.venv/bin/python _dev/og.py
```

Hay que volver a generarla cada vez que cambie el titular.

## Comprobado en navegador real

Encaja sin scroll a 1920×1080, 1440×900, 1366×768, 1280×720, 1024×640, 768×1024, 430×932, 390×844 y
320×700, sin desbordamiento horizontal en ninguno. Contraste mínimo 6,9:1. Autoplay silencioso, tap
que rebobina a 0 y activa el sonido, y clics posteriores que ya no rebobinan.
