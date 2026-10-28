# Rodando UTP GreenShare: notificaciones push e inbox

Esta entrega está preparada para la **versión PostgreSQL/Neon** del proyecto. Usa el servidor `server.js` incluido; **no copies solo `notifications.js` a una versión SQLite**.

## Archivos agregados

- `push-notifications.js`: endpoints, guardado en PostgreSQL, envío Web Push (VAPID).
- `public/js/notifications.js`: permiso del navegador, suscripción, centro de avisos, prueba y administración.
- `docs/schema-postgres.sql`: dos nuevas tablas (`push_subscriptions`, `app_notifications`).
- `public/service-worker.js`: eventos `push` y `notificationclick`, además de caché de la interfaz.

## Archivos modificados

- `server.js`: conecta el módulo y avisa al conductor/pasajero cuando se confirma una reserva.
- `public/index.html`: botón **Avisos** y sección **Centro de avisos**.
- `public/js/app.js`: comunica el estado de la sesión y desvincula la suscripción al cerrar sesión.
- `public/css/styles.css`: diseño responsive de la bandeja.
- `package.json`: dependencia `web-push`.
- `.env.example`: variables necesarias para VAPID.

## 1. Configurar Neon

En el directorio del proyecto, abre PowerShell:

```powershell
npm install
npm run db:init
```

El comando `db:init` añade las tablas nuevas sin borrar las tablas ni registros existentes. Comprueba en Neon SQL Editor:

```sql
SELECT COUNT(*) FROM push_subscriptions;
SELECT COUNT(*) FROM app_notifications;
```

## 2. Generar claves VAPID UNA SOLA VEZ

Después de `npm install`:

```powershell
npx web-push generate-vapid-keys --json
```

Copia ambos valores en tu archivo `.env` **privado**:

```env
VAPID_PUBLIC_KEY=PEGA_AQUI_LA_CLAVE_PUBLICA
VAPID_PRIVATE_KEY=PEGA_AQUI_LA_CLAVE_PRIVADA
VAPID_SUBJECT=mailto:admin@utpuebla.edu.mx
```

Mantén tu `DATABASE_URL`, `ADMIN_PASSWORD` y el resto de variables de tu proyecto. La clave privada NO se sube a GitHub. No generes claves nuevas en cada reinicio: las suscripciones antiguas dejarían de funcionar.

## 3. Iniciar y probar localmente

```powershell
npm run dev
```

1. Visita `http://localhost:3000` (localhost se acepta como contexto seguro para pruebas).
2. Inicia sesión con un usuario o el administrador.
3. En el menú pulsa **Avisos**.
4. Haz clic en **Activar notificaciones** y concede el permiso del navegador.
5. Pulsa **Enviar prueba a mi cuenta**.
6. Aparecerá el aviso en la bandeja; si el navegador admite Push y las claves están bien configuradas, también verá la notificación del sistema.
7. Haz clic en la notificación: debería abrir `/#avisos`.
8. Marca el aviso como leído.

La bandeja interna funciona aun cuando Push no esté soportado o se niegue el permiso. La notificación del sistema requiere conexión con el servicio Push, permiso y soporte del navegador.

## 4. Ejemplo práctico de reserva

Si un estudiante reserva un lugar, se crean dos avisos automáticos:

- Al conductor: **Nueva reserva en Rodando UTP**.
- Al pasajero: **Tu reserva fue confirmada**.

No se incluyen nombres, matrículas ni placas en el mensaje de pantalla bloqueada. Los detalles están dentro del panel autenticado.

## 5. Aviso administrativo

Con una cuenta `role=admin`, abre **Avisos** y utiliza **Aviso general**. Se guarda el mensaje en la bandeja de los usuarios y se intenta enviar push a los dispositivos suscritos. El endpoint tiene límite de frecuencia para evitar spam.

## 6. Publicar en Render

Añade en Render > Environment:

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `NODE_ENV=production`

Despliega una web con HTTPS. Abre la URL HTTPS, inicia sesión, activa notificaciones y envía una prueba. En iPhone/iPad (iOS 16.4+) instala la PWA en pantalla de inicio antes de solicitar Push.

## 7. Git (para tu siguiente commit)

```powershell
git status
git add server.js push-notifications.js package.json package-lock.json
git add public/index.html public/js/app.js public/js/notifications.js
git add public/service-worker.js public/css/styles.css
git add docs/schema-postgres.sql .env.example GUIA_NOTIFICACIONES_PUSH.md
git diff --cached --stat
git commit -m "feat: agregar notificaciones push y centro de avisos PWA"
git push origin main
```

Si tu rama se llama `master`, cambia `main` por `master` tras verificar `git branch --show-current`.

## 8. Solución de errores

- `Cannot find module 'web-push'`: ejecuta `npm install`.
- `Faltan VAPID`: revisa el `.env` y reinicia el servidor.
- `NotAllowedError`: el usuario bloqueó permiso; actívalo desde la configuración del navegador.
- No llega push pero sí aparece en bandeja: comprueba permiso, suscripción, claves, conexión, HTTPS y notificaciones del sistema operativo.
- Error de tablas: `npm run db:init` y comprueba `DATABASE_URL`.
- PWA muestra la versión anterior: en DevTools > Application > Service Workers pulsa Update, luego recarga.

## Nota de seguridad

Las suscripciones son privadas; se guardan por usuario en Neon y se eliminan al cerrar sesión voluntariamente o al detectar endpoints vencidos (404/410). El envío de prueba se limita a la propia cuenta autenticada. El administrador puede enviar avisos generales con límites por IP/usuario. Para producción institucional conviene añadir cola de trabajos, auditoría, filtros de consentimiento y políticas de retención.
