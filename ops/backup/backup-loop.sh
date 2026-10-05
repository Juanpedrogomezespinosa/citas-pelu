#!/bin/sh
# Copia de seguridad diaria de MySQL con retención.
#
#  - mysqldump --single-transaction: instantánea consistente (InnoDB) sin
#    bloquear las tablas, el salón puede seguir trabajando durante el backup.
#  - Se escribe a un fichero temporal y se renombra al terminar: nunca queda
#    un backup a medias con nombre "bueno".
#  - Retención: borra los backups de más de BACKUP_RETENCION_DAYS días.
#
# Restaurar: ver docs/operacion.md. COPIA TAMBIÉN LOS BACKUPS FUERA DEL SERVIDOR.
set -eu

HORA="${BACKUP_HOUR:-03}"
RETENCION="${BACKUP_RETENTION_DAYS:-30}"

hacer_backup() {
  marca=$(date +%Y%m%d-%H%M%S)
  destino="/backups/peluqueria-$marca.sql.gz"
  echo "[backup] Iniciando $destino"
  if mysqldump -h db -u root --single-transaction --routines --triggers --set-gtid-purged=OFF \
       --databases peluqueria | gzip -9 > "$destino.tmp"; then
    mv "$destino.tmp" "$destino"
    echo "[backup] OK $(du -h "$destino" | cut -f1)"
  else
    rm -f "$destino.tmp"
    echo "[backup] ERROR: el backup ha fallado" >&2
  fi
  find /backups -name 'peluqueria-*.sql.gz' -mtime "+$RETENCION" -print -delete
}

# Backup al arrancar (así un despliegue nuevo tiene copia desde el minuto uno)
hacer_backup

while true; do
  # Espera hasta la próxima HORA:00
  ahora=$(date +%s)
  objetivo=$(date -d "$(date +%Y-%m-%d) $HORA:00:00" +%s 2>/dev/null || echo 0)
  [ "$objetivo" -le "$ahora" ] && objetivo=$((objetivo + 86400))
  [ "$objetivo" -le "$ahora" ] && objetivo=$((ahora + 86400)) # date sin -d: cada 24 h
  sleep $((objetivo - ahora))
  hacer_backup
done
