-- Migración 0002 (DOWN): revierte la operativa del salón en orden inverso.
ALTER TABLE notificaciones
  DROP INDEX idx_notif_outbox,
  DROP COLUMN proximo_intento_en,
  DROP COLUMN plantilla_parametros,
  DROP COLUMN plantilla_clave;

DROP TABLE IF EXISTS cobro_lineas;
DROP TABLE IF EXISTS cobros;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS bloqueos_agenda;

-- Los clientes anonimizados no tienen teléfono y el esquema 0001 lo exige:
-- se les asigna un número ficticio único (+999 + id) para poder revertir.
UPDATE clientes SET telefono = CONCAT('+999', LPAD(id, 8, '0')) WHERE telefono IS NULL;

ALTER TABLE clientes
  DROP CHECK chk_clientes_anonimizado,
  DROP CHECK chk_clientes_telefono,
  DROP COLUMN anonimizado_en,
  MODIFY telefono VARCHAR(20) NOT NULL,
  ADD CONSTRAINT chk_clientes_telefono CHECK (telefono REGEXP '^[+][1-9][0-9]{7,14}$');

ALTER TABLE usuarios
  DROP CHECK chk_usuarios_debe_cambiar,
  DROP COLUMN token_version,
  DROP COLUMN debe_cambiar_password;
