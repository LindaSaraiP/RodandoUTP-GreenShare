# Rodando UTP GreenShare — Versión corregida 6.1

Aplicación web progresiva universitaria con frontend responsivo blanco y verde, Node.js, SQLite, Rodando Parking y EcoRodando.

## Correcciones principales de esta versión

- El **encabezado no se desborda**: los botones quedan en una sola fila cuando hay espacio, y aparece un menú plegable en tabletas y móviles.
- El mensaje principal tiene mejor proporción y no tapa el formulario de búsqueda.
- Las tarjetas de viaje, EcoRodando y Rodando Parking del inicio ya no se enciman ni recortan.
- Los botones ocultos no se muestran por error antes de iniciar sesión.
- El QR de Rodando Parking **ahora es un QR real escaneable**, que lleva a una página de verificación por código.
- Se corrige el cálculo de puntos en la tabla administrativa y se evita premiar más de una vez el mismo pase.
- El pase muestra en grande el número de pasajeros y, al verificarlo, nombres, carreras y matrículas.

## Tecnologías

- Frontend: HTML5, CSS3 y JavaScript (sin frameworks)
- Backend: Node.js 22.5+ con módulos nativos
- Base de datos: SQLite (`data/rodando-utp.db`)
- PWA: `manifest.webmanifest`, Service Worker y caché de recursos estáticos
- Código QR local: algoritmo JavaScript incluido en `public/js/qr.js` (sin conexiones a terceros)

## Requisitos y ejecución local (Windows)

1. Instala Node.js versión 22.5 o superior.
2. Extrae este ZIP **en una carpeta nueva**, para no mezclar archivos con versiones anteriores.
3. Abre PowerShell o la terminal de VS Code en la carpeta del proyecto.
4. Ejecuta:

```powershell
npm install
npm run dev
```

O ejecuta `INICIAR_WINDOWS.bat`. Abre **http://localhost:3000**.

Si el navegador sigue mostrando el diseño anterior de Rodando UTP, recarga con `Ctrl+Shift+R`; si persiste, ve a `F12 → Application → Service Workers → Unregister` y borra el almacenamiento del sitio.

## Usuarios y datos de demostración

El proyecto incluye en SQLite **12 estudiantes de ejemplo, 12 viajes y al menos 18 eventos EcoRodando**; además incluye una cuenta de administrador. Si borras la base de datos, Node.js vuelve a crear datos de ejemplo automáticamente.

**Cuenta de administrador (solo demostración):**

- Correo: `admin@utpuebla.edu.mx`
- Contraseña: `RodandoEco2026`

**Cuentas de prueba (contraseña `DemoEco2026`):**

- `carlos.medina@alumno.utpuebla.edu.mx` (tiene un viaje con 2 pasajeros y Rodando Parking activo para probar el pase)
- `mariana.lopez@alumno.utpuebla.edu.mx`
- `diego.hernandez@alumno.utpuebla.edu.mx`

Registro nuevo permitido únicamente con los dominios:

- `@utpuebla.edu.mx`
- `@alumno.utpuebla.edu.mx`

Se trata de una validación de formato de correo, no de verificación oficial de identidad universitaria.

## Cómo comprobar Rodando Parking

1. Inicia sesión como `carlos.medina@alumno.utpuebla.edu.mx`.
2. Ve a **Mi cuenta → Ir a mi panel**.
3. En la ruta activa de San Pedro Cholula, selecciona **Generar pase**.
4. Verás el pase con el **número de pasajeros grande**, nombres y datos académicos.
5. Escanea el QR para abrir `/verificar-pase.html?codigo=...`; la página consulta al backend en tiempo real y muestra el estado del pase.

**Importante:** si abres la aplicación en localhost y escaneas desde otro teléfono, ese teléfono no podrá acceder al `localhost` de la PC. Publica la app en una URL HTTPS para verificar desde otros dispositivos.

El pase acredita información registrada en la app, pero **no otorga por sí solo acceso preferente a estacionamientos de la UTP**. Eso requiere autorización institucional.

## EcoRodando

Los EcoPuntos están almacenados como movimientos en la tabla `eco_events`. El nivel y el árbol animado se calculan según el saldo. Las cifras ambientales son aproximaciones educativas por plaza compartida, no mediciones de emisiones reales.

## Panel administrativo

Inicia sesión con la cuenta admin y entra al enlace **Administración**. Desde allí puedes ver estadísticas, consultar estudiantes y modificar/verificar/eliminar cuentas. Las acciones están protegidas desde el backend.

## Publicación

Render admite el servidor Node.js. En producción define estas variables de entorno:

```dotenv
NODE_ENV=production
ADMIN_EMAIL=admin@utpuebla.edu.mx
ADMIN_PASSWORD=CAMBIA_AQUI_LA_CONTRASENA_DEMO_POR_UNA_FUERTE
```

No uses la contraseña de demostración en una publicación abierta. En el plan gratuito de Render, el archivo SQLite puede no conservarse entre despliegues; usa un disco persistente o PostgreSQL para datos reales.

## Estructura principal

```text
RodandoUTP_GreenShare_Corregido/
├── server.js
├── package.json
├── README.md
├── INICIAR_WINDOWS.bat
├── data/rodando-utp.db
└── public/
    ├── index.html
    ├── verificar-pase.html
    ├── manifest.webmanifest
    ├── service-worker.js
    ├── css/styles.css
    ├── js/app.js
    ├── js/qr.js
    ├── js/verificar-pase.js
    └── img/icon-192.png, icon-512.png
```
