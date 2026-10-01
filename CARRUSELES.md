# Descarga de IA Carruseles Aesthetic

## Flujo publicado

- Página: https://danielfeyto.com/carruseles/
- Formulario propio: nombre, WhatsApp, email, Instagram opcional, negocio, facturación y objetivo.
- `POST /carruseles/registro` valida origen, tamaños, contenido, consentimiento y límite de frecuencia.
- D1 guarda el lead y la sesión en una operación atómica. Solo después devuelve la cookie segura.
- `GET /carruseles/acceso` permite a la interfaz recuperar el acceso vigente.
- `GET /carruseles/descargar` comprueba sesión y lead antes de servir el ZIP; sin acceso vuelve al opt-in.
- Sesión: 24 horas, token aleatorio de 256 bits, cookie HttpOnly/Secure/SameSite=Lax; solo su hash en D1.
- No hay envío de email, alta en marketing ni sincronización con GHL. El formulario GHL de la portada sigue independiente.

El formulario obliga a completar campos válidos; no verifica la titularidad del email o teléfono.
Una persona que ya haya descargado el archivo puede compartir su copia.

## Datos privados

Cloudflare D1: `danielfeyto-carruseles`. La tabla `carrusel_leads` contiene los registros, su fecha UTC
y la versión del consentimiento. Sesiones y límites viven en tablas separadas. La tarea diaria
de las 05:17 UTC elimina sesiones caducadas y registros con 180 días de antigüedad.
Se guarda un hash temporal para el límite por IP; no se guarda la IP en la tabla de leads.

Para exportar los registros con una sesión de Cloudflare autorizada:

```sh
npm ci
npx wrangler login
node scripts/export-leads.mjs
```

El CSV se guarda en `_private/` con permisos de usuario. No se publica ni entra en Git. El script
neutraliza fórmulas de hoja de cálculo. También se pueden gestionar los registros desde la consola
D1 del panel de Cloudflare. Al borrar un lead por su ID se eliminan sus sesiones en cascada.
No exportar la tabla de sesiones ni añadir datos personales al repositorio público.

## ZIP privado

Archivo: `IA-Carruseles-Aesthetic.zip`, 86.790.109 bytes, 71 estilos y documentación de instalación.
SHA-256 de la entrega del 1 de octubre de 2026:

`4ced5ed70e30e4d5b067bd6671dc0b3e41a5bb4b8042a7137a89029d4f86528e`

KV `DOWNLOADS` almacena cinco partes de hasta 20 MiB porque cada valor de KV tiene un límite
de 25 MiB. El Worker las transmite por streaming como un único ZIP; no hay URL pública de KV.
Los identificadores de las partes incluyen su hash y el manifiesto se cambia al terminar la subida.
La propagación de KV puede hacer que una actualización tarde en llegar a todas las ubicaciones.

```sh
node scripts/upload-download.mjs /ruta/IA-Carruseles-Aesthetic.zip --remote
```

No colocar ZIP, claves ni exportaciones dentro de `carruseles/` o `fonts/`: son directorios públicos.
La generación de `_site/` usa una lista explícita de entradas públicas y excluye los archivos de trabajo,
dependencias, base local y código del servidor. El ZIP original se conserva fuera de este repositorio.

## Desarrollo y despliegue

Node 24 para las pruebas (usan SQLite integrado):

```sh
npm ci
npm test
npx wrangler d1 migrations apply DB --local
node scripts/upload-download.mjs /ruta/IA-Carruseles-Aesthetic.zip --local
npm run dev -- --port 8795
```

Wrangler genera `_site/` antes de arrancar. El directorio generado evita que los cambios en la base
local disparen recargas continuas. Tras cambiar páginas raíz durante el desarrollo, reiniciar el servidor.

Antes de un primer despliegue con una migración nueva:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy --dry-run
```

El push a `main` despliega por la integración de Cloudflare. Alternativa autorizada: `npm run deploy`.
Comprobar en producción el rechazo sin cookie, un registro de prueba, el ZIP completo y su hash;
retirar únicamente los registros de prueba identificados. No publicar credenciales ni cookies en logs.

La plantilla editable de esta landing, fuera del repo, es
`/Users/danifcn/projects/carrusel-aesthetic-landing/fuente.html`; su modal también incorpora este flujo.
`carruseles/optin.js` se mantiene en este repositorio y debe conservarse al regenerar la landing.

## Recuperación

Cloudflare conserva versiones del Worker. En un fallo de despliegue, restaurar la versión anterior
desde Deployments; comprobar después la portada y `/carruseles/`. Una versión anterior al opt-in
no ofrece esta descarga. El código, D1 y KV se despliegan por separado: un rollback del Worker no
borra los registros. Para volver a otro ZIP, subir de nuevo ese archivo con el script; no borrar partes
antiguas durante una actualización en curso.

Referencias: [límites de KV](https://developers.cloudflare.com/kv/platform/limits/),
[lectura y streaming](https://developers.cloudflare.com/kv/api/read-key-value-pairs/),
[Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/).
