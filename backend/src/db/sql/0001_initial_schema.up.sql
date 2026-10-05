-- =============================================================================
-- Migración 0001 (UP): esquema inicial — gestión de citas de peluquería (un local)
-- Motor: MySQL 8.0.16+ / InnoDB (transacciones ACID, FKs y CHECK constraints)
--
-- Decisiones de diseño (skill sql-relational-design):
--  * 3FN: ningún dato derivable se almacena. El precio de una cita se calcula
--    con SUM(cita_servicios.precio). El historial de un cliente se deriva de
--    citas + cita_servicios (vista v_historial_servicios_cliente).
--  * Desnormalización justificada: citas.fecha_fin (= inicio + duración de los
--    servicios). Se guarda porque la detección de solapes es la consulta más
--    crítica y necesita un rango indexable (idx_citas_empleado_fecha).
--  * cita_servicios guarda precio y duración "congelados" al reservar: es un
--    hecho histórico, no una copia (si cambia la tarifa, el pasado no cambia).
--  * Integridad en el motor: FKs con ON DELETE explícito, CHECKs para rangos,
--    formatos y booleanos, y NOT NULL + DEFAULT en todo lo que tiene un valor
--    natural. Las columnas NULL que quedan representan "dato no proporcionado"
--    (apellidos, email, alergias...), donde '' sería ambiguo.
--  * Borrado lógico (`activo`) en entidades maestras: el historial nunca pierde
--    referencias, y las FKs de citas son RESTRICT para impedir borrados físicos.
--  * Fechas de citas en DATETIME y HORA LOCAL del salón (APP_TIMEZONE). Las
--    escribe siempre Node, nunca NOW() de MySQL, para no depender de la zona
--    horaria del servidor de BD.
--  * Concurrencia: citas.version permite bloqueo optimista (dos recepcionistas
--    editando la misma cita) y los servicios usan SELECT ... FOR UPDATE.
-- Cada sentencia termina en ';' al final de línea: el runner las ejecuta de una
-- en una (multipleStatements está desactivado por seguridad).
-- =============================================================================

CREATE TABLE usuarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  rol            ENUM('admin', 'recepcion', 'empleado') NOT NULL DEFAULT 'recepcion',
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso  DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT chk_usuarios_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE empleados (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT UNSIGNED NULL,
  nombre            VARCHAR(80)  NOT NULL,
  apellidos         VARCHAR(120) NULL,
  telefono          VARCHAR(20)  NULL,
  email             VARCHAR(150) NULL,
  especialidad      VARCHAR(150) NULL,
  color_calendario  CHAR(7)      NOT NULL DEFAULT '#9F1239',
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_empleados_usuario UNIQUE (usuario_id),
  CONSTRAINT fk_empleados_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_empleados_color CHECK (color_calendario REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_empleados_telefono CHECK (telefono IS NULL OR telefono REGEXP '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT chk_empleados_activo CHECK (activo IN (0, 1)),
  INDEX idx_empleados_activo (activo)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Horario semanal. dia_semana: 0=domingo ... 6=sábado (igual que Date.getDay()).
-- Un empleado sin filas trabaja en el horario general del local.
CREATE TABLE horarios_empleado (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empleado_id  INT UNSIGNED NOT NULL,
  dia_semana   TINYINT UNSIGNED NOT NULL,
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  CONSTRAINT chk_horario_dia   CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horario_rango CHECK (hora_fin > hora_inicio),
  CONSTRAINT uq_horario UNIQUE (empleado_id, dia_semana, hora_inicio),
  CONSTRAINT fk_horario_empleado FOREIGN KEY (empleado_id)
    REFERENCES empleados (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE clientes (
  id                            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre                        VARCHAR(80)  NOT NULL,
  apellidos                     VARCHAR(120) NULL,
  -- E.164: clave para casar los mensajes entrantes de WhatsApp con el cliente
  telefono                      VARCHAR(20)  NOT NULL,
  email                         VARCHAR(150) NULL,
  fecha_nacimiento              DATE NULL,
  -- Consentimiento explícito (RGPD) para recibir mensajes por WhatsApp
  acepta_whatsapp               TINYINT(1) NOT NULL DEFAULT 1,
  -- Ficha técnica y preferencias
  tipo_cabello                  ENUM('liso', 'ondulado', 'rizado', 'afro', 'otro') NULL,
  color_preferido               VARCHAR(100) NULL,
  tipo_corte_preferido          VARCHAR(120) NULL,
  sensibilidad_cuero_cabelludo  ENUM('ninguna', 'baja', 'media', 'alta') NOT NULL DEFAULT 'ninguna',
  alergias                      VARCHAR(500) NULL,
  productos_preferidos          VARCHAR(500) NULL,
  notas                         TEXT NULL,
  activo                        TINYINT(1) NOT NULL DEFAULT 1,
  created_at                    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_clientes_telefono UNIQUE (telefono),
  CONSTRAINT chk_clientes_telefono CHECK (telefono REGEXP '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT chk_clientes_whatsapp CHECK (acepta_whatsapp IN (0, 1)),
  CONSTRAINT chk_clientes_activo CHECK (activo IN (0, 1)),
  INDEX idx_clientes_nombre (nombre, apellidos),
  INDEX idx_clientes_email (email),
  INDEX idx_clientes_activo (activo)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE servicios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  descripcion       VARCHAR(500) NULL,
  categoria         ENUM('corte', 'color', 'tratamiento', 'peinado', 'barberia', 'otros') NOT NULL DEFAULT 'otros',
  duracion_minutos  SMALLINT UNSIGNED NOT NULL,
  precio            DECIMAL(8, 2) NOT NULL,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_servicios_nombre UNIQUE (nombre),
  CONSTRAINT chk_servicios_duracion CHECK (duracion_minutos BETWEEN 5 AND 600),
  CONSTRAINT chk_servicios_precio CHECK (precio >= 0),
  CONSTRAINT chk_servicios_activo CHECK (activo IN (0, 1)),
  INDEX idx_servicios_activo_categoria (activo, categoria)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE citas (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id            INT UNSIGNED NOT NULL,
  empleado_id           INT UNSIGNED NOT NULL,
  fecha_inicio          DATETIME NOT NULL,
  fecha_fin             DATETIME NOT NULL,
  estado                ENUM('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio')
                          NOT NULL DEFAULT 'pendiente',
  notas                 VARCHAR(1000) NULL,
  motivo_cancelacion    VARCHAR(500) NULL,
  confirmada_via        ENUM('manual', 'whatsapp') NULL,
  confirmada_en         DATETIME NULL,
  cancelada_en          DATETIME NULL,
  completada_en         DATETIME NULL,
  recordatorio_enviado  TINYINT(1) NOT NULL DEFAULT 0,
  -- Bloqueo optimista: cada UPDATE incrementa la versión
  version               INT UNSIGNED NOT NULL DEFAULT 1,
  creado_por            INT UNSIGNED NULL,
  -- DATETIME escrito desde Node (no TIMESTAMP) para compararlo con
  -- fecha_inicio sin conversiones de zona horaria (job de recordatorios)
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_citas_rango CHECK (fecha_fin > fecha_inicio),
  CONSTRAINT chk_citas_recordatorio CHECK (recordatorio_enviado IN (0, 1)),
  -- Invariantes de estado: solo una cita cancelada lleva fecha de cancelación, etc.
  CONSTRAINT chk_citas_cancelada CHECK ((estado = 'cancelada') = (cancelada_en IS NOT NULL)),
  CONSTRAINT chk_citas_completada CHECK ((estado = 'completada') = (completada_en IS NOT NULL)),
  CONSTRAINT fk_citas_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_citas_empleado FOREIGN KEY (empleado_id)
    REFERENCES empleados (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_citas_creado_por FOREIGN KEY (creado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,
  -- Detección de solapes por empleado (consulta más crítica del sistema)
  INDEX idx_citas_empleado_fecha (empleado_id, fecha_inicio, fecha_fin),
  -- Historial y próxima cita de un cliente
  INDEX idx_citas_cliente_fecha (cliente_id, fecha_inicio),
  -- Dashboard y filtros por estado
  INDEX idx_citas_estado_fecha (estado, fecha_inicio),
  -- Job de recordatorios
  INDEX idx_citas_recordatorio (recordatorio_enviado, estado, fecha_inicio)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Servicios de cada cita (N:M) con precio/duración congelados y notas técnicas
-- (p. ej. la fórmula del tinte aplicado, clave para la próxima visita).
CREATE TABLE cita_servicios (
  cita_id           INT UNSIGNED NOT NULL,
  servicio_id       INT UNSIGNED NOT NULL,
  precio            DECIMAL(8, 2) NOT NULL,
  duracion_minutos  SMALLINT UNSIGNED NOT NULL,
  notas_tecnicas    VARCHAR(500) NULL,
  PRIMARY KEY (cita_id, servicio_id),
  CONSTRAINT chk_cs_precio CHECK (precio >= 0),
  CONSTRAINT chk_cs_duracion CHECK (duracion_minutos > 0),
  CONSTRAINT fk_cs_cita FOREIGN KEY (cita_id)
    REFERENCES citas (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cs_servicio FOREIGN KEY (servicio_id)
    REFERENCES servicios (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_cs_servicio (servicio_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Registro de mensajes de WhatsApp salientes y entrantes
CREATE TABLE notificaciones (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cita_id                 INT UNSIGNED NULL,
  cliente_id              INT UNSIGNED NULL,
  tipo                    ENUM('confirmacion_cita', 'recordatorio', 'cambio_cita', 'cancelacion',
                               'respuesta_automatica', 'mensaje_entrante') NOT NULL,
  direccion               ENUM('saliente', 'entrante') NOT NULL DEFAULT 'saliente',
  canal                   ENUM('whatsapp') NOT NULL DEFAULT 'whatsapp',
  proveedor               ENUM('console', 'twilio', 'meta') NOT NULL,
  -- Teléfono usado en ESE envío (hecho histórico: el cliente puede cambiarlo)
  telefono                VARCHAR(20) NOT NULL,
  mensaje                 TEXT NOT NULL,
  -- Ciclo de vida saliente: pendiente -> enviado -> entregado -> leido | fallido.
  -- Los entrantes se guardan como 'recibido'.
  estado                  ENUM('pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'recibido')
                            NOT NULL DEFAULT 'pendiente',
  proveedor_message_id    VARCHAR(100) NULL,
  -- Evita duplicados (dos recordatorios de la misma cita si el job corre dos
  -- veces, varias instancias del backend o reintentos del webhook)
  clave_idempotencia      VARCHAR(120) NULL,
  respuesta_interpretada  ENUM('confirmar', 'cancelar', 'desconocida') NULL,
  error                   VARCHAR(500) NULL,
  intentos                TINYINT UNSIGNED NOT NULL DEFAULT 0,
  enviado_en              DATETIME NULL,
  entregado_en            DATETIME NULL,
  leido_en                DATETIME NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_notif_proveedor_msg UNIQUE (proveedor_message_id),
  CONSTRAINT uq_notif_idempotencia UNIQUE (clave_idempotencia),
  CONSTRAINT chk_notif_direccion_estado CHECK ((direccion = 'entrante') = (estado = 'recibido')),
  CONSTRAINT fk_notif_cita FOREIGN KEY (cita_id)
    REFERENCES citas (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_notif_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_notif_cita_tipo (cita_id, tipo),
  INDEX idx_notif_cliente_fecha (cliente_id, created_at),
  INDEX idx_notif_estado_fecha (estado, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Historial de servicios por cliente (derivado, no duplicado)
CREATE VIEW v_historial_servicios_cliente AS
SELECT
  c.cliente_id,
  c.id                                  AS cita_id,
  c.fecha_inicio,
  c.estado,
  e.id                                  AS empleado_id,
  CONCAT_WS(' ', e.nombre, e.apellidos) AS empleado_nombre,
  s.id                                  AS servicio_id,
  s.nombre                              AS servicio_nombre,
  s.categoria,
  cs.precio,
  cs.duracion_minutos,
  cs.notas_tecnicas,
  c.notas                               AS notas_cita
FROM citas c
JOIN empleados e       ON e.id = c.empleado_id
JOIN cita_servicios cs ON cs.cita_id = c.id
JOIN servicios s       ON s.id = cs.servicio_id;
