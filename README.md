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
| Destino del CTA | `<a class="cta">` | Abre el modal de la lista de espera (formulario GHL `uPi9t8JSNLjUciI0ZOIs`). Sin JS, lleva al formulario alojado |
| Vídeo de la VSL | `#vsl-frame` → `src` | Bunny `583428 / 5c6e7217-086b-44c4-a8d2-9f5132fced85` (provisional) |

Para cambiar el vídeo basta con sustituir la librería y el GUID dentro de la URL del embed. Mantén
`autoplay=true&muted=true`: los navegadores bloquean el autoplay con sonido, y por eso existe la
capa de "toca para activar el sonido", que además rebobina a 0 para no perder los primeros segundos.

## Lista de espera (formulario de GHL)

El botón abre un modal propio (`<dialog id="lista">`) con el formulario "form dani" de GHL dentro.
El formulario vive en un iframe de otro dominio, así que **su aspecto se decide en GHL**, no aquí:

- **`_dev/ghl-form.css` se pega en GHL** (Sites, Forms, form dani, Styles, Custom CSS). Quita la
  tarjeta blanca, pone los campos oscuros, las etiquetas en caja alta y el botón crema con halo y badge,
  como el de la landing. Sin ese CSS el formulario sale blanco con el botón azul de GHL.
- En GHL también: idioma del formulario en español (si no, los errores salen como "Email is required")
  y el texto del botón corto, **"Apuntarme"**: "Entrar en la lista de espera" parte en dos líneas en móvil.

Cómo funciona por dentro, y por qué:

1. **Carga diferida.** El iframe y `form_embed.js` se cargan 1,5 s después del `load` (o a los 5 s
   como tarde, o al pasar el ratón por el botón), para no quitarle ancho de banda a la VSL.
2. **El iframe va dentro de `#inline-uPi9t8JSNLjUciI0ZOIs-wrapper`.** Si no existe ese contenedor,
   `form_embed.js` mete el iframe en uno suyo, y mover un iframe en el DOM lo recarga: el formulario
   cargaba dos veces y parpadeaba. Con ese id, el script lo deja donde está.
3. **Cerrado no está en `display:none`.** Está maquetado fuera de pantalla, `visibility:hidden` e
   `inert`. Con `display:none` GHL medía el formulario sin ancho (976 px de alto) y al abrir daba un salto.
   `inert` hace falta porque GHL fuerza `visibility:visible` en el iframe.
4. **Esqueleto** con la forma del formulario mientras carga. Se retira cuando `form_embed.js` enseña
   el iframe, que es cuando ya tiene su altura definitiva.
5. **Estado final propio.** Al registrarse el contacto, GHL manda a la página un `postMessage`
   `set-sticky-contacts` con los datos. Ahí el modal cambia el formulario por "Ya estás dentro", con el
   nombre si lo han puesto, y el mensaje de gracias de GHL no llega a verse.
6. **El vídeo se pausa** al abrir el modal y se reanuda al cerrarlo, solo si lo pausó el modal.
7. El velo (oscuro y desenfocado) va en `::backdrop`. Ojo al verificar: el WebKit de Playwright no
   pinta ningún `backdrop-filter`, así que ahí el fondo sale nítido. El desenfoque se comprueba en Chromium.

Se cierra con la X, con Esc, con un clic fuera de la tarjeta y con "Volver al vídeo". El foco vuelve
al botón al cerrar.

## Cómo se controla el vídeo

El player de Bunny pinta sus propios controles al pasar el ratón y al pausar, y competían con la
barra de retención. En vez de taparlos con una franja oscura, que se veía mal, el vídeo lleva un
**escudo transparente** por encima del iframe desde el primer toque:

- Se come los eventos de ratón, así que Bunny nunca llega a mostrar sus controles en hover.
- Un clic pausa o reanuda por la API de Player.js.
- Al pausar se ve el fotograma tal cual, sin negro y sin desenfoque: solo un velo del 26% para que
  el play tenga contraste. Como el escudo se come el ratón, el player no llega a sacar sus controles
  (verificado a 1 s y a 4 s de la pausa).

## Geometría del vídeo

El vídeo **no es 16:9**. Medido en navegador con dos cajas distintas (1200×900 → 1,91083 y
1400×600 → 1,91167), su proporción real es **1,9112**, y está en `--vsl-ar`. Con un contenedor 16:9
Bunny dejaba unos 10 px de banda negra abajo. **Si se cambia la VSL hay que volver a medirla.**

Además hacían falta tres cosas para que el borde quedara limpio de verdad:

1. **Sobrebarrido del iframe** (`scale(1.016)`). La grabación trae un filo gris de ~1 px en su borde
   superior; el escalado lo empuja fuera del recorte y se pierden ~4 px por lado, que no se notan.
2. **Altura a entero.** La caja caía en alturas fraccionarias (177,38 px) y el navegador componía la
   última fila mezclada con el fondo. Un `ResizeObserver` la redondea en cada cambio de tamaño.
3. **Borde superior alineado a la rejilla de píxeles** de la pantalla, con un `translateY` de menos
   de un píxel sobre el marco.

Verificado en 24 tamaños de pantalla y, para los bordes, en 18 combinaciones de tamaño y densidad
(×2 y ×3): cero bandas negras y cero filos. El bisel deja **6 px idénticos** por los cuatro lados
(radio exterior 23, relleno 6, radio interior 17) y la barra de retención va **debajo del vídeo,
nunca encima**, para no tapar la cámara de la esquina inferior.

### Backlight

Detrás del marco hay tres capas con caídas distintas, que juntas hacen de luz ambiente: un halo
amplio que baña el fondo, un filo ceñido al marco que da la sensación de pantalla encendida, y un
derrame elíptico hacia abajo. Respira un 8% cada 9 s. Se apaga con `prefers-reduced-motion`.

Resultado: la barra de retención es una línea fina de 7 px y no hay ningún degradado negro. El único
efecto secundario es que no hay pantalla completa ni barra de avance nativas, que en una VSL es lo
que se quiere. Si algún día los hicieran falta, se apagan los controles en **Bunny → Stream →
librería 583428 → Player → "Show Controls"** y se puede retirar el escudo.

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
- **Iconos**: dibujados sobre rejilla de píxeles (16×16 la flecha del botón, 21×21 el altavoz y el
  play), al estilo del set Pixel de Streamline (CC BY 4.0) que sirvió de referencia. La flecha es un
  corchete en la esquina superior derecha más un asta diagonal: se probaron seis construcciones y las
  de cabeza maciza leían como un pico y las de brazo largo como un «7».
- **Entrada**: un solo primitivo, `slide in up` con desenfoque que se resuelve a mitad del recorrido
  (no al final, que se vería como un enfoque tardío). Escalonado en seis tiempos; el botón remata con
  una curva propia, más larga, para que su halo florezca al aterrizar.

## Marca

El logo sale de `evento-paraguay/Assets/logo-flecha-2026-09-19`. En el repo:

- `logo.svg` — variante dorada sobre transparente, recortada al dibujo. Va en el pie.
- `favicon.svg` — variante 03 (negro sobre degradado amarillo), que es la que más aguanta a 16 px.
- `apple-touch-icon.png` (180) e `icon-512.png`, generados desde el favicon.

## Imagen social

`og.png` (1200×630) lleva la promesa a la izquierda y una **preview de la propia página** a la
derecha. Se regenera desde `_dev/og.html`, que primero captura la página del servidor local:

```
/Users/danifcn/mac-vault/.claude/skills/excalidraw-diagram/references/.venv/bin/python _dev/og.py
```

Hay que volver a generarla cada vez que cambie el titular o el diseño. Necesita el servidor local levantado.

## Dos detalles que no se ven en el código

El bloom del recuadro dorado salía recortado en un rectángulo, y tenía **dos causas independientes**:

1. Las animaciones de entrada terminaban en `filter: blur(0)`. Un filtro distinto de `none`, aunque
   sea de cero, deja una región de filtro que recorta lo que pintan sus hijos. Ahora terminan en
   `filter: none` y al acabar se retira la clase `rise`.
2. `.gh` llevaba `overflow:hidden` y `filter` a la vez. **Eso solo falla en WebKit**, que es el motor
   de Safari y el de la webview de Instagram: en Chrome se veía perfecto y en un iPhone real salía el
   rectángulo. Ahora son dos elementos, `.gh` con el bloom y `.gh__box` con el recorte y la superficie.

Moraleja: los glows hay que verificarlos también con WebKit, no solo con la vista de móvil del
escritorio.

## Cumplimiento

El pie lleva el aviso de independencia respecto a Meta y Google y el de resultados no garantizados, y
enlaza las cuatro páginas legales (`/privacidad`, `/terminos`, `/cookies`, `/aviso-legal`). La cifra
del titular está **fuera del `<h1>`**: se ve igual, pero la etiqueta va en la línea del mecanismo.

Las páginas legales identifican al responsable por `hola@danielfeyto.com`, sin razón social. **Ese
buzón tiene que existir y contestar**, y el RGPD pide identificar al responsable del tratamiento, así
que conviene añadir la entidad en cuanto esté.

### Lo que lee una máquina

Ningún campo de metadatos lleva ya la cifra: `title`, `description`, `og:title`, `og:description`,
`og:image:alt`, `twitter:*` y el `alt` de las imágenes van liderados por el mecanismo. La tarjeta
para compartir (`og.png`) tampoco la lleva, ni en su titular ni en la captura que enseña, que se
recorta a la zona del vídeo y el botón. Esto importa porque **las plataformas pasan un OCR a la
imagen**, no solo leen el texto.

Hay además un bloque `JSON-LD` que declara la página como informativa y mete el aviso de resultados
en `disambiguatingDescription`, y la línea del titular apunta al aviso del pie con
`aria-describedby`, de modo que afirmación y matiz quedan atados en el propio documento.

La cifra sigue **visible en el cuerpo**, que es donde tiene que estar. Ocultarla a los revisores y
enseñársela a las personas sería cloaking, que es motivo de cierre de cuenta publicitaria.

## Comprobado en navegador real

Encaja sin scroll a 1920×1080, 1440×900, 1366×768, 1280×800, 1280×720, 1024×640, 768×1024, 430×932,
390×844, 360×780 y 320×700, sin desbordamiento horizontal en ninguno. Contraste mínimo 6,9:1.

El titular ocupa **exactamente 3 líneas en móvil** de 320 a 430 px, con los saltos forzados en el
marcado (`<br class="br-m">`) y el cuerpo escalado para que la línea más larga siempre quepa. En
escritorio son 2 líneas.

Verificado también: autoplay silencioso, el toque rebobina a 0 y activa el sonido, el escudo pausa y
reanuda, y los controles de Bunny no aparecen ni en hover ni en pausa.
