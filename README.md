# Panel de Tareas — Despliegue en Cloudflare Pages

Este proyecto es la misma app que ya conoces (tablero, matriz, calendario,
alertas de tiempo), lista para vivir en un dominio real y no solo dentro de
Claude. Se despliega desde la terminal con **Wrangler** (el CLI de Cloudflare)
y usa **Cloudflare KV** como base de datos compartida para que todo el equipo
vea el mismo tablero.

## Qué cambió respecto a la versión de Claude

La versión que corre dentro de Claude.ai usa un almacenamiento propio del
entorno de artefactos (`window.storage`) que **no existe fuera de Claude**.
Para que la app funcione en un dominio real, se agregó:

- Un pequeño "polyfill" en `public/index.html` que redefine `window.storage`
  para hablar con tu propio backend (`/api/kv/...`) en vez del de Claude.
- Dos Cloudflare Pages Functions en `functions/api/kv/` que leen y escriben
  en una base de datos KV de Cloudflare (guarda las tareas).
- Una Cloudflare Pages Function en `functions/api/attachments/` que sube,
  descarga y borra los archivos adjuntos en un bucket de Cloudflare R2.

El resto del código (toda la lógica de tareas, calendario, alertas, etc.) es
exactamente el mismo.

## Requisitos

- Una cuenta de Cloudflare (gratis): https://dash.cloudflare.com/sign-up
- Node.js instalado (para usar `npx wrangler` o `npm install`)

## Pasos desde la terminal

```bash
# 1. Entra a la carpeta del proyecto
cd panel-marketing-deploy

# 2. Instala wrangler como dependencia del proyecto
npm install

# 3. Inicia sesión con tu cuenta de Cloudflare (abre el navegador una vez)
npx wrangler login

# 4. Crea el namespace de KV (la "base de datos" compartida del equipo)
npx wrangler kv namespace create PANEL_KV
```

El comando anterior imprime algo como:

```
[[kv_namespaces]]
binding = "PANEL_KV"
id = "a1b2c3d4e5f6..."
```

Copia ese `id` y pégalo en `wrangler.toml`, reemplazando
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

```bash
# 5. Habilita R2 una vez desde el dashboard (dash.cloudflare.com → R2 →
#    "Enable R2" / "Purchase R2 Plan"; tiene capa gratuita). Luego crea el
#    bucket donde viven los archivos adjuntos:
npx wrangler r2 bucket create panel-marketing-attachments

# 6. Despliega
npx wrangler pages deploy public --project-name=panel-marketing
```

Wrangler va a preguntar si quieres crear el proyecto de Pages — di que sí.
Al terminar te da una URL real, algo como:

```
https://panel-marketing.pages.dev
```

Esa URL ya es un dominio de verdad (no localhost), accesible para todo tu
equipo.

## Conectar el KV al proyecto (si los datos no se guardan)

A veces Cloudflare requiere confirmar el binding de KV desde el dashboard,
aunque ya esté en `wrangler.toml`. Si al usar la app ves un error al guardar
tareas:

1. Ve a https://dash.cloudflare.com → **Workers & Pages** → tu proyecto
   `panel-marketing`.
2. **Settings → Functions → KV namespace bindings**.
3. Agrega: variable `PANEL_KV` → namespace `PANEL_KV` (el que creaste).
4. Si los adjuntos tampoco se guardan, revisa igual **Settings → Functions →
   R2 bucket bindings**: variable `PANEL_ATTACHMENTS` → bucket
   `panel-marketing-attachments`.
5. Vuelve a desplegar: `npx wrangler pages deploy public --project-name=panel-marketing`.

## Usar tu propio dominio

Si ya tienes un dominio en Cloudflare:

```bash
npx wrangler pages domain add panel-marketing tudominio.com
```

O desde el dashboard: tu proyecto → **Custom domains → Set up a domain**.

## Volver a desplegar después de hacer cambios

```bash
npm run deploy
```

## Notificaciones a Slack (resumen diario)

`notifier/` es un **Worker aparte** (no una Pages Function) porque solo un
Worker independiente puede tener un Cron Trigger. Corre entre semana a las
8:00am hora de Costa Rica y lee la misma base de tareas del panel; si hay
tareas atrasadas, marcadas como "requiere ajustes", o que vencen al día
siguiente, publica un resumen en un canal de Slack. Si no hay nada que
reportar, no envía nada.

```bash
cd notifier

# 1. Crea un "Incoming Webhook" en tu workspace de Slack:
#    https://api.slack.com/apps → Create New App → From scratch →
#    Incoming Webhooks → actívalo → Add New Webhook to Workspace →
#    elige el canal → copia la URL.

# 2. Guarda esa URL como secreto (nunca la pongas en el código):
npx wrangler secret put SLACK_WEBHOOK_URL

# 3. Despliega el worker
npx wrangler deploy
```

Para probarlo sin esperar al horario programado, ve a **dash.cloudflare.com
→ Workers & Pages → panel-marketing-notifier → Settings → Trigger Events**
(o Cron Triggers) y dispara una ejecución manual. El horario está en
`notifier/wrangler.toml` (`triggers.crons`) por si lo quieres cambiar.

## Controlar quién puede entrar (Cloudflare Access)

El link del panel hoy es abierto: cualquiera con la URL puede editar todo.
Para restringirlo a tu equipo con Cloudflare Access (login sin contraseña,
código de un solo uso por correo):

1. **dash.cloudflare.com → Zero Trust** → si es la primera vez, elige un
   nombre de equipo (team name) y el plan gratis.
2. **Access → Applications → Add an application → Self-hosted**.
3. Dominio: el de tu proyecto, ej. `panel-marketing-57v.pages.dev`
   (o tu dominio propio si agregaste uno).
4. Crea una política: **Include → Emails** y agrega las direcciones de tu
   equipo autorizadas a entrar.
5. Guarda. La próxima vez que alguien abra el link, Cloudflare le pedirá su
   correo y un código de un solo uso antes de dejarlo ver el panel.

## Notas

- Todo el contenido de `public/index.html` es una sola página (HTML + CSS +
  JS) — puedes editarlo directamente con cualquier editor de texto.
- Las tareas y adjuntos se guardan en la misma base KV para todo el que abra
  la URL: no hay login real, solo el selector "¿Quién eres?" (se guarda en
  el navegador de cada quien y sirve para firmar el historial y los
  comentarios, no para restringir acceso). Para eso último ver la sección de
  Cloudflare Access arriba.
- Cada tarea guarda un historial de cambios (quién y qué cambió) y admite
  comentarios, visibles al abrirla. Al eliminar una tarea hay ~6 segundos
  para deshacerlo desde el aviso que aparece abajo.
- Los archivos adjuntos se guardan como binario en un bucket de R2 (no en
  KV), con un límite de 100 MB por archivo definido en el código
  (`MAX_FILE_BYTES`) — es el máximo de tamaño de solicitud que aceptan
  Cloudflare Workers/Pages Functions. R2 en sí admite objetos de hasta 5 TB.
