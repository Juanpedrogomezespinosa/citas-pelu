-- =============================================================================
-- Migración 0002 (UP): operativa del salón
--   * Gestión de contraseñas y revocación de sesiones (usuarios)
--   * RGPD: anonimización de clientes
--   * Bloqueos de agenda (vacaciones, festivos, bajas)
--   * Caja: productos, cobros y líneas de cobro
--   * Outbox de notificaciones (reintentos y plantillas de WhatsApp)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Usuarios: cambio de contraseña obligatorio y versión de token (al cambiar la
-- contraseña se incrementa y todos los JWT emitidos antes dejan de valer)
-- ---------------------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0 AFTER rol,
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER debe_cambiar_password,
  ADD CONSTRAINT chk_usuarios_debe_cambiar CHECK (debe_cambiar_password IN (0, 1));

-- ---------------------------------------------------------------------------
-- Clientes (RGPD): un cliente anonimizado conserva su id (las citas y cobros
-- siguen cuadrando en contabilidad) pero pierde todos sus datos personales,
-- incluido el teléfono. Solo un cliente anonimizado puede no tener teléfono.
-- ---------------------------------------------------------------------------
ALTER TABLE clientes
  DROP CHECK chk_clientes_telefono,
  MODIFY telefono VARCHAR(20) NULL,
  ADD COLUMN anonimizado_en DATETIME NULL AFTER activo,
  ADD CONSTRAINT chk_clientes_telefono CHECK (telefono IS NULL OR telefono REGEXP '^[+][1-9][0-9]{7,14}$'),
  ADD CONSTRAINT chk_clientes_anonimizado CHECK (telefono IS NOT NULL OR anonimizado_en IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Bloqueos de agenda. empleado_id NULL = afecta a todo el local (festivo).
-- ---------------------------------------------------------------------------
CREATE TABLE bloqueos_agenda (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empleado_id   INT UNSIGNED NULL,
  tipo          ENUM('vacaciones', 'festivo', 'baja', 'formacion', 'otro') NOT NULL DEFAULT 'otro',
  fecha_inicio  DATETIME NOT NULL,
  fecha_fin     DATETIME NOT NULL,
  motivo        VARCHAR(200) NULL,
  creado_por    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_bloqueos_rango CHECK (fecha_fin > fecha_inicio),
  CONSTRAINT fk_bloqueos_empleado FOREIGN KEY (empleado_id)
    REFERENCES empleados (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bloqueos_creado_por FOREIGN KEY (creado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_bloqueos_empleado_fecha (empleado_id, fecha_inicio, fecha_fin),
  INDEX idx_bloqueos_fecha (fecha_inicio, fecha_fin)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Productos de venta (champús, mascarillas...). stock UNSIGNED: el motor
-- impide un stock negativo aunque fallara la validación de la aplicación.
-- ---------------------------------------------------------------------------
CREATE TABLE productos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  descripcion  VARCHAR(500) NULL,
  precio       DECIMAL(8, 2) NOT NULL,
  stock        INT UNSIGNED NOT NULL DEFAULT 0,
  activo       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_productos_nombre UNIQUE (nombre),
  CONSTRAINT chk_productos_precio CHECK (precio >= 0),
  CONSTRAINT chk_productos_activo CHECK (activo IN (0, 1)),
  INDEX idx_productos_activo (activo)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Cobros (caja). 3FN: el importe NO se almacena; se calcula como
-- SUM(cantidad * precio_unitario) de sus líneas - descuento.
-- Un cobro no se borra: se anula (trazabilidad contable).
-- ---------------------------------------------------------------------------
CREATE TABLE cobros (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cita_id           INT UNSIGNED NULL,
  cliente_id        INT UNSIGNED NULL,
  fecha             DATETIME NOT NULL,
  metodo            ENUM('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro') NOT NULL,
  descuento         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  estado            ENUM('pagado', 'anulado') NOT NULL DEFAULT 'pagado',
  anulado_en        DATETIME NULL,
  motivo_anulacion  VARCHAR(300) NULL,
  notas             VARCHAR(500) NULL,
  registrado_por    INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Una cita solo puede tener UN cobro vigente (los anulados no cuentan):
  -- columna generada + UNIQUE (los NULL no colisionan entre sí)
  cita_cobrada      INT UNSIGNED GENERATED ALWAYS AS (IF(estado = 'pagado', cita_id, NULL)) STORED,
  CONSTRAINT uq_cobros_cita_vigente UNIQUE (cita_cobrada),
  CONSTRAINT chk_cobros_descuento CHECK (descuento >= 0),
  CONSTRAINT chk_cobros_anulado CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL)),
  CONSTRAINT fk_cobros_cita FOREIGN KEY (cita_id)
    REFERENCES citas (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cobros_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cobros_registrado_por FOREIGN KEY (registrado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_cobros_fecha (estado, fecha),
  INDEX idx_cobros_cliente_fecha (cliente_id, fecha)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE cobro_lineas (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cobro_id         INT UNSIGNED NOT NULL,
  tipo             ENUM('servicio', 'producto') NOT NULL,
  servicio_id      INT UNSIGNED NULL,
  producto_id      INT UNSIGNED NULL,
  -- Profesional que realizó el servicio (informe de producción por estilista)
  empleado_id      INT UNSIGNED NULL,
  -- Descripción y precio congelados en el momento del cobro (hecho histórico)
  descripcion      VARCHAR(150) NOT NULL,
  cantidad         SMALLINT UNSIGNED NOT NULL,
  precio_unitario  DECIMAL(8, 2) NOT NULL,
  CONSTRAINT chk_cl_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_cl_precio CHECK (precio_unitario >= 0),
  CONSTRAINT chk_cl_tipo CHECK (
    (tipo = 'servicio' AND servicio_id IS NOT NULL AND producto_id IS NULL) OR
    (tipo = 'producto' AND producto_id IS NOT NULL AND servicio_id IS NULL)
  ),
  CONSTRAINT fk_cl_cobro FOREIGN KEY (cobro_id)
    REFERENCES cobros (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cl_servicio FOREIGN KEY (servicio_id)
    REFERENCES servicios (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cl_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cl_empleado FOREIGN KEY (empleado_id)
    REFERENCES empleados (id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_cl_cobro (cobro_id),
  INDEX idx_cl_servicio (servicio_id),
  INDEX idx_cl_producto (producto_id),
  INDEX idx_cl_empleado (empleado_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Outbox de notificaciones: los mensajes se insertan en la MISMA transacción
-- que la operación de negocio y un worker los envía con reintentos.
-- ---------------------------------------------------------------------------
ALTER TABLE notificaciones
  ADD COLUMN plantilla_clave VARCHAR(30) NULL AFTER mensaje,
  ADD COLUMN plantilla_parametros JSON NULL AFTER plantilla_clave,
  ADD COLUMN proximo_intento_en DATETIME NULL AFTER intentos,
  ADD INDEX idx_notif_outbox (direccion, estado, proximo_intento_en);
