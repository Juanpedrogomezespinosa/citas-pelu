# Revisión de código (skill `code-reviewer-clean`), segunda iteración, 2026-10-05

**Alcance:** todo lo añadido en la segunda fase:

- **Base de datos y backend:** migración 0002, outbox de WhatsApp, plantillas, bloqueos, caja, usuarios y contraseñas, sesión por cookie, RGPD, Redis y métricas.
- **Frontend:** las páginas nuevas y la agenda.
- **Infraestructura:** Docker, nginx, backups y CI.

## Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| Backend: `eslint` (type-checked), `tsc`, `prettier --check` | Sin errores |
| Backend: tests unitarios | 16/16 |
| Backend: tests de integración contra MySQL real | 38/38, estables en 3 ejecuciones seguidas |
| Migraciones up → down → up, y 0002 revertida sola con clientes anonimizados | OK |
| Migraciones aplicadas en desarrollo (`.ts`) y leídas por el build de producción (`.js`) | OK (tras corregir el hallazgo C2) |
| API compilada en `NODE_ENV=production` | Cookie `Secure`, logs JSON, simulador 404, métricas 401 sin token |
| Frontend: `eslint`, `astro check`, `prettier --check`, build | Sin errores; 11 páginas |
| Chrome contra la API real | Login por cookie; completar con ficha técnica → cobrar con producto (53,50 €) → informe; bloqueo rechazado mostrando la cita afectada; vistas por profesional y semanal; primer acceso con contraseña temporal y menú restringido al rol |
| `docker compose config` (desarrollo y producción) y YAML de CI y Prometheus | Válidos |
| **No verificado** | Construcción de las imágenes Docker (el daemon no estaba arrancado: lo hará la CI) y envío real con Twilio o Meta (requiere credenciales) |

## Checklist

| Área | Estado |
|---|---|
| Atomicidad | ✅ La reserva y su aviso, el cobro con líneas y stock, la baja con cancelaciones y avisos, y el mensaje entrante con su acción y respuesta: cada uno es una sola transacción |
| Consistencia | ✅ Invariantes en los servicios y en el motor: stock `UNSIGNED`, un solo cobro vigente por cita (columna generada + UNIQUE), `CHECK` de tipos de línea y de anonimización |
| Aislamiento | ✅ `FOR UPDATE` ordenado (empleados, productos), `FOR UPDATE SKIP LOCKED` en el outbox, bloqueo optimista en citas, todos los empleados bloqueados para un festivo |
| Durabilidad | ✅ El outbox elimina la pérdida de avisos tras el COMMIT (hallazgo W1 de la revisión anterior). Backups `--single-transaction` |
| Capas | ✅ Los servicios no conocen Express; los proveedores de WhatsApp tampoco; la UI no contiene lógica de datos (hooks) |
| Validación y SQL | ✅ DTO zod en todas las rutas nuevas; solo placeholders |
| Secretos | ✅ Token fuera de JavaScript (cookie `httpOnly`); `.env*` y el token de métricas en `.gitignore`; la contraseña temporal se muestra una sola vez y con `Cache-Control: no-store` |

## Hallazgos corregidos

**C1 · Critical (Integridad) — Mensajes de WhatsApp recién encolados quedaban fuera de la cola**
- Ubicación: `backend/src/models/notificacion.model.ts` (`reclamarPendientes`).
- Problema: MySQL **redondea** los milisegundos al guardar un `DATETIME`. Un mensaje encolado a las 10:00:00.7 quedaba programado para las 10:00:01, y el worker que pasaba a las 10:00:00.8 no lo veía, así que esperaba un ciclo entero. Lo detectaron los tests de integración.
- Corrección: el corte se compara con el segundo siguiente.

**C2 · Critical (Despliegue) — Producción no arrancaba sobre una base migrada en desarrollo**
- Ubicación: `backend/src/db/migrator.ts`.
- Problema: Knex guarda el nombre de la migración **con extensión**. Una base migrada con `tsx` (`.ts`) hacía que el build (`.js`) la diera por "corrupta" y la API no arrancaba.
- Corrección: fuente de migraciones propia que registra los nombres sin extensión. Verificado en ambos sentidos.

**W1 · Warning (Seguridad / disponibilidad) — Límite de login compartido por todos los usuarios detrás de dos proxies**
- Ubicación: `backend/src/config/env.ts`, `app.ts`, `docker-compose.prod.yml`.
- Problema: `trust proxy = 1` con la cadena proxy TLS → nginx → API hacía que todos los clientes compartieran IP. Diez intentos fallidos de cualquiera bloqueaban el login de todo el salón durante 15 minutos.
- Corrección: `TRUST_PROXY` pasa a ser el número de saltos (2 por defecto en producción, documentado).

**W2 · Warning (Seguridad) — nginx perdía la CSP en los recursos estáticos**
- Ubicación: `frontend/nginx.conf`.
- Problema: un `add_header` dentro de un `location` anula todas las cabeceras heredadas del `server`.
- Corrección: cabeceras solo en `server` y `Cache-Control` variable mediante `map`.

**W3 · Warning (Atomicidad) — La baja de un profesional podía saltarse la comprobación de citas**
- Ubicación: `backend/src/dtos/empleado.dto.ts`, `services/empleado.service.ts`.
- Problema: `PUT /empleados/:id` con `activo: false` aplicaba la baja y el resto de cambios de la ficha en dos transacciones separadas.
- Corrección: `activo` ya no se acepta en el `PUT`. La baja va solo por `DELETE` y el alta por `POST /:id/reactivar`. Lo cubre un test de integración.

**P1 · Polish (UX) — Errores menores de la interfaz detectados en Chrome**
- Ubicación: varios componentes del frontend.
- Problemas y correcciones:
  - La etiqueta superior del eje Y se montaba sobre el título del gráfico: se añade margen superior.
  - `first-letter:uppercase` no funciona en elementos en línea: pasan a `inline-block`.
  - La baja de un profesional detectaba el éxito leyendo un estado obsoleto: la acción devuelve `true`.

## Hallazgos abiertos

**W4 · Warning (Fiabilidad) — Garantía "al menos una vez" del outbox**
- Ubicación: `backend/src/services/outbox.service.ts`.
- Problema: si el proceso muere justo después de que el proveedor acepte un mensaje y antes de marcarlo como enviado, al vencer el alquiler (2 min) se reenviará. Es preferible a perderlo, pero el cliente podría recibir un duplicado.
- Corrección propuesta: enviar la clave de idempotencia al proveedor cuando lo admita (Meta: `biz_opaque_callback_data`; Twilio: comprobar antes por `MessageSid`).

**P2 · Polish (Rendimiento) — Listado de cobros truncado a 1000 filas sin avisar**
- Ubicación: `backend/src/models/cobro.model.ts` (`list`).
- Problema: con rangos muy largos se cortaría el listado (el informe agrega en SQL y no se ve afectado).
- Corrección propuesta: paginar igual que las citas (`paginationShape` + `meta`).

**P3 · Polish (Seguridad) — `/api/health/ready` es público**
- Problema: expone contadores de la cola, sin datos personales.
- Corrección propuesta: si molesta, limitar en nginx a la IP del monitor de disponibilidad.

**P4 · Polish (Tests) — Sin tests automáticos del frontend**
- Problema: la UI se ha verificado manualmente en Chrome.
- Corrección propuesta: Playwright para los flujos críticos (login → reservar → completar → cobrar) contra el `docker-compose` de CI.
