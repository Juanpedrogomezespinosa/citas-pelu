# Peluquería · Gestión de citas

Aplicación web para gestionar una peluquería (un solo local):

- **Agenda:** vista de lista, por profesional y semanal, con horarios del equipo, vacaciones, bajas y festivos.
- **Clientes:** ficha completa con preferencias capilares e historial de servicios con la ficha técnica de cada visita (fórmulas, técnicas…).
- **WhatsApp:** confirmación, recordatorios automáticos y avisos de cambio y cancelación. El cliente **confirma o cancela respondiendo al mensaje**.
- **Caja:** cobro de citas y venta de productos con control de stock, anulaciones e informes.
- **Equipo y permisos:** usuarios por rol (administración, recepción, estilista).
- **RGPD:** exportación y anonimización de datos.

| Capa | Tecnología |
|---|---|
| Backend | Node.js 22, Express 5, TypeScript, MVC (routes / controllers / services / models / dtos) |
| Base de datos | MySQL 8, migraciones reversibles (Knex), consultas preparadas (mysql2), transacciones ACID |
| Frontend | Astro 7 (estático) + islas React 19 + Tailwind CSS 4 |
| WhatsApp | Twilio o Meta Cloud API con plantillas aprobadas (o `console` en desarrollo) |
| Operación | Docker, nginx, Redis, backups diarios, Prometheus, GitHub Actions |

```
.
├── backend/                 API REST (ver CLAUDE.md para la arquitectura)
│   ├── src/  config/ routes/ controllers/ services/ models/ dtos/ middleware/ utils/ db/ tools/
│   └── test/ unit/ integration/
├── frontend/                Panel (Astro + React), nginx.conf
├── docs/                    operacion.md · whatsapp-plantillas.md · CODE_REVIEW.md
├── ops/                     backup/ (script de copias) · prometheus/ (scrape y alertas)
├── skills/                  guías de arquitectura que usa Claude Code
├── docker-compose.yml       MySQL para desarrollo
├── docker-compose.prod.yml  despliegue completo
└── .github/workflows/ci.yml
```

## Desarrollo local

Requisitos: **Node.js ≥ 22.12** y **MySQL 8** (local o `docker compose up -d`).

```bash
# 1. Base de datos (con Docker; con MySQL propio, crea la BD "peluqueria" y un usuario)
docker compose up -d

# 2. Backend
cd backend
npm install
cp .env.example .env        # ya hay un .env de desarrollo con un JWT_SECRET aleatorio
npm run db:migrate
npm run db:seed             # administrador (ADMIN_EMAIL / ADMIN_PASSWORD) y datos de ejemplo
npm run dev                 # http://localhost:4000/api/health

# 3. Frontend (en otra terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                 # http://localhost:4321 (el proxy reenvía /api al backend)
```

Entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env` del backend y **cámbiala** en *Mi cuenta*.

### Comandos

| Backend | |
|---|---|
| `npm run dev` | API con recarga automática |
| `npm run lint` · `npm run typecheck` · `npm run format` | Calidad de código |
| `npm test` | Tests unitarios (agenda, teléfonos, interpretación de respuestas…) |
| `npm run test:integration` | Tests contra MySQL real: **borra y recrea** `peluqueria_test` (usuario `TEST_DB_USER`, por defecto `root`) |
| `npm run db:migrate` · `db:rollback` · `db:status` | Migraciones |
| `npm run whatsapp:test -- <tel> [plantilla]` | Envío real de prueba con el proveedor configurado |

| Frontend | |
|---|---|
| `npm run dev` · `npm run build` | Desarrollo · build estático (incluye `astro check`) |
| `npm run lint` · `npm run format` | Calidad de código |

## Funcionalidades por rol

| | Estilista | Recepción | Administración |
|---|:-:|:-:|:-:|
| Ver la agenda, las fichas y el historial | ✓ | ✓ | ✓ |
| Confirmar, completar (con ficha técnica) y marcar «no vino» | ✓ | ✓ | ✓ |
| Reservar, reprogramar, cancelar y enviar recordatorios | | ✓ | ✓ |
| Editar clientes · bloqueos de agenda (vacaciones, festivos) | | ✓ | ✓ |
| Caja: cobrar y vender productos | | ✓ | ✓ |
| Anular cobros · informes · productos y servicios | | | ✓ |
| Equipo (fichas y horarios) · usuarios · bajas · RGPD | | | ✓ |

## WhatsApp

- **Desarrollo:** con `WHATSAPP_PROVIDER=console`, los mensajes salen en la consola del backend. Para simular la respuesta de un cliente (con `WHATSAPP_SIMULATOR_ENABLED=true`):

  ```bash
  curl -X POST http://localhost:4321/api/webhooks/whatsapp/simular -b cookies.txt \
    -H "Origin: http://localhost:4321" -H "Content-Type: application/json" \
    -d '{"telefono":"611111111","mensaje":"SI"}'
  ```

- **Producción:** necesitas las 4 plantillas aprobadas (confirmación, recordatorio, cambio y cancelación). Los textos exactos y el procedimiento están en **[docs/whatsapp-plantillas.md](docs/whatsapp-plantillas.md)**. El webhook es `https://tu-dominio/api/webhooks/whatsapp/{twilio|meta}`.
- **Fiabilidad (patrón outbox):** cada mensaje se guarda en la misma transacción que la cita y lo envía un worker con reintentos (1, 5, 15 y 60 min). Un fallo del proveedor nunca rompe una reserva, y una caída del servidor nunca pierde un aviso.
- **Respuestas reconocidas:** «SI», «sí», «1», «ok», «vale», «confirmo» o 👍 confirman; «NO», «2», «cancelar» o «no puedo» cancelan. La respuesta se aplica a la cita del último mensaje enviado al cliente.

## Despliegue

`docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` levanta MySQL, Redis, la API, nginx con el panel y los backups diarios. HTTPS, restauración de backups, monitorización y alertas están en **[docs/operacion.md](docs/operacion.md)**.

## API REST

Sesión por cookie `httpOnly` (o `Authorization: Bearer` para integraciones). Respuesta: `{ success, data, meta? }`; error: `{ success: false, error: { message, code, details? } }`.

| Recurso | Endpoints |
|---|---|
| Sesión | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `PUT /auth/password` · `POST /auth/logout-todas` |
| Usuarios (admin) | `GET/POST /usuarios` · `PATCH /usuarios/:id` · `POST /usuarios/:id/restablecer-password` |
| Clientes | `GET/POST /clientes` · `GET/PUT/DELETE /clientes/:id` (`?cancelar_citas=true`) · `GET /:id/historial` · `POST /:id/reactivar` · `GET /:id/exportar` · `POST /:id/anonimizar` |
| Servicios | `GET/POST /servicios` · `GET/PUT/DELETE /servicios/:id` |
| Empleados | `GET/POST /empleados` · `GET/PUT/DELETE /empleados/:id` · `PUT /empleados/:id/horarios` |
| Bloqueos | `GET /bloqueos?desde&hasta[&empleado_id]` · `POST /bloqueos` · `DELETE /bloqueos/:id` |
| Citas | `GET /citas` · `GET /citas/disponibilidad` · `POST /citas` · `GET/PATCH /citas/:id` (requiere `version`) · `PATCH /:id/estado` · `POST /:id/completar` · `PUT /:id/notas-tecnicas` · `POST /:id/cancelar` · `POST /:id/recordatorio` |
| Caja | `GET/POST /productos` · `PUT /productos/:id` · `GET/POST /cobros` · `GET /cobros/:id` · `POST /cobros/:id/anular` · `GET /informes/caja` |
| Notificaciones | `GET /notificaciones` · `POST /notificaciones/:id/reintentar` |
| Webhooks | `POST /webhooks/whatsapp/twilio` · `GET/POST /webhooks/whatsapp/meta` · `POST /webhooks/whatsapp/simular` (solo desarrollo) |
| Operación | `GET /health` · `GET /health/ready` · `GET /metrics` (con token) |

Códigos de error útiles:

- Validación: `VALIDATION_ERROR` (con `details.fields`).
- Agenda: `SLOT_UNAVAILABLE`, `BLOCKED`, `OUT_OF_HOURS`, `PAST_DATE`, `VERSION_CONFLICT`, `INVALID_TRANSITION`.
- Bajas y bloqueos: `HAS_FUTURE_APPOINTMENTS` y `HAS_APPOINTMENTS` (con `details.citas`).
- Caja: `OUT_OF_STOCK`, `ALREADY_PAID`.
- Sesión: `PASSWORD_CHANGE_REQUIRED`.

## Integridad de datos (ACID)

- **Atomicidad:** cada operación es una transacción. Por ejemplo, la reserva y su aviso de WhatsApp se guardan juntos, o el cobro, sus líneas y el descuento de stock.
- **Consistencia:** validación zod en la entrada, invariantes en los servicios (horario, bloqueos, máquina de estados, stock) y restricciones en el motor (FKs, `CHECK`, `UNIQUE` y stock `UNSIGNED`).
- **Aislamiento:**
  - `SELECT … FOR UPDATE` serializa la agenda de cada profesional: no hay dobles reservas.
  - Los productos se bloquean en orden, así que el último producto no se vende dos veces.
  - `SKIP LOCKED` en la cola de WhatsApp permite varias instancias.
  - El bloqueo optimista (`version`) detecta ediciones simultáneas de una cita.
- **Durabilidad:** se responde después del COMMIT. Además hay backups diarios consistentes (`--single-transaction`).

Todo esto lo comprueban los tests de integración.

## Seguridad

- **Sesión:** JWT en cookie `httpOnly`, `Secure` y `SameSite=Strict`, con comprobación de `Origin` contra CSRF. Las sesiones se revocan al cambiar la contraseña, el rol o al desactivar al usuario.
- **Contraseñas:** bcrypt, política de complejidad, contraseña temporal con cambio obligatorio y login resistente a la enumeración de usuarios.
- **Entradas:** validación y saneado de todo lo que llega, solo consultas preparadas y webhooks verificados por firma (Twilio y Meta).
- **Cabeceras:** `helmet` en la API y CSP estricta en nginx. Rate limiting compartido en Redis.
- **Datos:** consentimiento de WhatsApp por cliente, exportación y anonimización RGPD. Los logs no contienen datos personales.

## Desarrollo con Claude Code

`CLAUDE.md` recoge las convenciones y `skills/` las guías por capa. El checklist antes de dar algo por terminado está en `CLAUDE.md`, y la última revisión de código en `docs/CODE_REVIEW.md`.
