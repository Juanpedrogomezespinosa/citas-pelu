# Operación en producción

Guía para desplegar, actualizar, hacer copias de seguridad, restaurar y vigilar la aplicación.

## Despliegue (un servidor con Docker)

Requisitos: un servidor Linux con Docker y Docker Compose, y un dominio apuntando a él.

```bash
git clone <repositorio> peluqueria && cd peluqueria
cp .env.production.example .env.production
# Rellena los secretos (openssl rand -hex 32), PUBLIC_BASE_URL y el proveedor de WhatsApp
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Con eso arrancan:

- **db**: MySQL 8.4 con un volumen persistente.
- **redis**: contadores del rate limiting, compartidos entre instancias.
- **api**: aplica las migraciones pendientes al arrancar y luego levanta el servidor.
- **web**: nginx con el panel y el proxy de `/api`. Es el único servicio con puerto publicado.
- **backup**: copia diaria de la base de datos.

**IP real de los clientes:** `TRUST_PROXY` es el número de proxies delante de la API. Con un proxy TLS delante de nginx (lo habitual) es `2`; si nginx recibe el tráfico directamente, `1`. Si te quedas corto, todos los usuarios comparten IP y el límite de intentos de login bloquearía a todo el salón a la vez.

**HTTPS:** la cookie de sesión es `Secure` en producción, así que **el panel tiene que servirse por HTTPS**. La opción más sencilla es poner delante un proxy con certificados automáticos (Caddy, Traefik o el balanceador del proveedor) que reenvíe al puerto `HTTP_PORT`. Si usas WhatsApp, el webhook también necesita HTTPS.

**Primer acceso:** crea el administrador una sola vez:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec \
  -e ADMIN_EMAIL=tu@email.es -e ADMIN_PASSWORD='UnaClaveLarga2026' api node dist/db/seed.js
```

El seed también carga los datos de ejemplo si el catálogo está vacío. Después puedes editarlos o desactivarlos desde el panel.

## Actualizar a una versión nueva

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

La API aplica las migraciones al arrancar. El cierre es ordenado: termina las peticiones en curso y el lote de WhatsApp que esté enviando. **Antes de una actualización con migraciones, lanza un backup manual** (ver abajo).

## Copias de seguridad

El servicio `backup` hace un `mysqldump --single-transaction`: una copia consistente que no bloquea al salón mientras trabaja.

- Se ejecuta al arrancar y luego cada día a las `BACKUP_HOUR` (03:00 por defecto).
- Los ficheros (`peluqueria-AAAAMMDD-HHMMSS.sql.gz`) se guardan en `BACKUP_DIR` (`./backups`).
- Se borran los que tienen más de `BACKUP_RETENTION_DAYS` días (30).

> ⚠️ Un backup que solo está en el mismo servidor no protege de un fallo de disco ni de un borrado del servidor. **Copia `./backups` fuera** a diario, por ejemplo con `rclone` a un almacenamiento externo o con las instantáneas de disco del proveedor.

Backup manual (antes de actualizar, por ejemplo):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production restart backup   # hace una copia al arrancar
```

### Restaurar

```bash
# 1. Para la API para que nadie escriba durante la restauración
docker compose -f docker-compose.prod.yml --env-file .env.production stop api
# 2. Restaura (el dump incluye CREATE DATABASE)
gunzip -c backups/peluqueria-20261005-030000.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
# 3. Arranca la API (aplicará las migraciones que falten si el backup es de una versión anterior)
docker compose -f docker-compose.prod.yml --env-file .env.production start api
```

**Prueba la restauración de vez en cuando**, en otra máquina o en una base de datos de prueba. Un backup que nunca se ha restaurado no está comprobado.

## Monitorización y alertas

| Qué | Dónde | Para qué |
|---|---|---|
| `GET /api/health` | Público | *Liveness*: el proceso responde. Lo usa el healthcheck de Docker |
| `GET /api/health/ready` | Público | *Readiness*: base de datos, Redis y cola de WhatsApp (503 si la cola lleva más de 15 min atascada) |
| `GET /api/metrics` | Red interna, con `METRICS_TOKEN` | Métricas Prometheus: duración y errores HTTP, envíos de WhatsApp, cola pendiente, citas creadas, CPU y memoria |
| Logs | `docker compose logs -f api` | JSON estructurado en producción (sin datos personales ni tokens) |

### Opción sencilla: monitor de disponibilidad externo

Da de alta en un servicio de *uptime* (Uptime Kuma, Better Stack, UptimeRobot…) la URL `https://tu-dominio/api/health/ready` con aviso por email o Telegram. Así te enteras si se cae la API, la base de datos o se atasca la cola de WhatsApp.

### Opción completa: Prometheus + alertas

```bash
echo -n "$METRICS_TOKEN" > ops/prometheus/metrics-token   # el mismo valor que en .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production --profile monitoring up -d
```

Prometheus queda en `http://127.0.0.1:9090`, accesible solo desde el servidor (usa un túnel SSH). Las reglas de `ops/prometheus/alertas.yml` cubren:

- API caída.
- Cola de WhatsApp atascada (más de 15 min).
- Envíos de WhatsApp fallando.
- Errores 5xx.
- Latencia alta.

Para recibir los avisos, añade Alertmanager con tu canal (email, Telegram, Slack…) y descomenta el bloque `alerting` de `prometheus.yml`.

## WhatsApp en producción

1. Da de alta y consigue aprobación de las 4 plantillas: `docs/whatsapp-plantillas.md`.
2. Configura el webhook del proveedor:
   - Twilio: `https://tu-dominio/api/webhooks/whatsapp/twilio`
   - Meta: `https://tu-dominio/api/webhooks/whatsapp/meta`
3. Prueba el envío: `docker compose ... exec api node dist/tools/whatsapp-test.js +34600111222 recordatorio`.
4. Vigila la métrica `whatsapp_envios_total{resultado="fallido"}` o la sección *Actividad de WhatsApp* del panel. Los fallidos se pueden reintentar desde ahí.

## RGPD

- **Acceso y portabilidad:** en la ficha del cliente, *Exportar datos* descarga un JSON con todos sus datos.
- **Supresión:** *Anonimizar* borra de forma irreversible los datos personales, las fichas técnicas y los mensajes. Las citas y cobros se conservan sin datos personales (obligación contable).
- **Retención:** con `RGPD_ANONIMIZACION_AUTOMATICA=true`, un proceso mensual anonimiza a los clientes sin citas en los últimos `RGPD_RETENCION_MESES` meses. Está desactivado por defecto porque es irreversible: actívalo cuando el salón haya fijado su política de retención.
- **Consentimiento:** cada cliente tiene `acepta_whatsapp`. Sin él no se le envía ningún mensaje.
- Los backups contienen datos personales: protégelos (cifrado y acceso restringido) y aplica también la retención.
