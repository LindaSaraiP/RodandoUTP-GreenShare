# Rodando UTP GreenShare — Backend PostgreSQL / Neon (v6.2)

Esta es la misma PWA v6.1 visual que estás utilizando, pero con **backend PostgreSQL real**. Mantiene registro, login, perfiles, publicación y búsqueda de rutas, reservas, EcoRodando, QR de Rodando Parking y gestión administrativa.

## Qué cambió

- `server.js`: eliminado el uso de `node:sqlite`, todas las rutas usan `pg`/Neon de manera asíncrona.
- `db.js`: conexión PostgreSQL leyendo `DATABASE_URL` del entorno.
- `docs/schema-postgres.sql`: cinco tablas PostgreSQL con llaves foráneas e índices.
- `scripts/init-db.js`: inicialización de tablas (segura para ejecutar más de una vez).
- `scripts/check-db.js`: consulta de conteos para verificar registros.
- `scripts/seed-demo.js`: 12 estudiantes, 12 viajes, 18 reservas y 18 movimientos de EcoPuntos de demostración (solo con autorización explícita).
- `scripts/import-sqlite.js`: alternativa para importar usuarios, rutas, reservas y puntos desde tu SQLite original si Neon está vacía.

## Guía desde Windows / Visual Studio Code

### 1. Abrir carpeta correcta

Descomprime esta versión y abre la carpeta `RodandoUTP_GreenShare_PostgreSQL` en VS Code.

### 2. Instalar dependencias

```powershell
npm install
```

### 3. Copiar el archivo de configuración

```powershell
Copy-Item .env.example .env
```

Abre `.env` y coloca la **URL privada real** de Neon obtenida desde el botón `Connect` (base `rodando_utp`, rama `production`).

```env
DATABASE_URL=postgresql://USUARIO:CLAVE@SERVIDOR.neon.tech/rodando_utp?sslmode=require
NODE_ENV=development
PORT=3000
ADMIN_EMAIL=admin@utpuebla.edu.mx
ADMIN_PASSWORD=UnaContrasenaNuevaSegura123
```

Nunca subas `.env` a GitHub. El `.gitignore` ya está configurado.

### 4. Crear/verificar tablas

```powershell
npm run db:init
```

Si ya ejecutaste el SQL de tablas en Neon, no se borra nada: este script usa `CREATE TABLE IF NOT EXISTS`.

### 5. Elegir SOLO UNA forma de cargar datos iniciales

**Opción A: mantener las cuentas, viajes y EcoPuntos de tu SQLite anterior.**

- Copia el archivo original `rodando-utp.db` a `data/rodando-utp.db` de esta nueva carpeta.
- En tu `.env` agrega `ALLOW_SQLITE_IMPORT=true`.
- Ejecuta `npm run db:import`.
- Después cambia a `ALLOW_SQLITE_IMPORT=false`.

**Opción B: generar los 12 registros de demostración (solo si Neon no tiene usuarios).**

- En tu `.env` agrega `ALLOW_DEMO_SEED=true`.
- Ejecuta `npm run seed`.
- Después cambia a `ALLOW_DEMO_SEED=false`.

Para las cuentas demo, la contraseña es `DemoEco2026`. **No uses cuentas de demostración para datos reales.**

### 6. Ejecutar el servidor

```powershell
npm run dev
```

Abre: `http://localhost:3000`

Ahora el backend trabajará con Neon, no con el archivo SQLite. Puedes verificarlo en `http://localhost:3000/api/health`, que debe decir `"database":"postgresql"`.

### 7. Consultar conteos

En otra terminal, ejecuta:

```powershell
npm run db:check
```

O en el SQL Editor de Neon:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM rides;
SELECT COUNT(*) FROM reservations;
SELECT COUNT(*) FROM eco_events;
```

### 8. Hacer commit sin subir secretos

```powershell
git status
git add server.js db.js package.json package-lock.json .env.example .gitignore docs/schema-postgres.sql scripts/ README.md
git diff --cached --name-only
git commit -m "feat: migrar Rodando UTP de SQLite a PostgreSQL Neon"
git push origin main
```

Confirma tu rama con `git branch` si no es `main`. Verifica que `.env`, `node_modules` y `data/rodando-utp.db` NO estén preparados para el commit.

### 9. Desplegar en Render

- Conecta GitHub → repositorio `RodandoUTP-GreenShare`, rama `main`.
- Servicio: `Web Service`, runtime `Node`.
- Build command: `npm install`.
- Start command: `npm start`.
- Health check: `/api/health`.
- Variables: `DATABASE_URL` (la URL Neon), `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (nueva contraseña de 12+ caracteres).
- No coloques `ALLOW_DEMO_SEED` ni `ALLOW_SQLITE_IMPORT` en producción.

## Seguridad y límites del proyecto

- Dominio de registro permitido: `@utpuebla.edu.mx` o `@alumno.utpuebla.edu.mx`.
- Las cuentas no envían correos de verificación institucional: la restricción de dominio **no garantiza identidad real**.
- Contraseñas con `scrypt` + sal; sesiones en cookies HttpOnly; CSRF; SQL parametrizado; rate limit.
- Reserva de asientos con transacción y bloqueo `SELECT ... FOR UPDATE`.
- Pases Parking emitidos solo al conductor con 2+ pasajeros confirmados; generación idempotente para evitar duplicar puntos.
- El QR permite acceder a nombres y matrículas a quien posea el enlace: usar solo para demostraciones o con autorización explícita.
- Las estadísticas de CO₂ y gasolina son **estimaciones pedagógicas**, no mediciones verificadas.
- Para operar institucionalmente necesitarías verificación de estudiantes, aprobación del estacionamiento y controles adicionales de privacidad.

## Estructura

```text
RodandoUTP_GreenShare_PostgreSQL/
  server.js
  db.js
  .env.example
  package.json
  docs/schema-postgres.sql
  scripts/init-db.js
  scripts/check-db.js
  scripts/seed-demo.js
  scripts/import-sqlite.js
  public/...
```
