-- Migración 0001 (DOWN): elimina el esquema inicial en orden inverso de dependencias.
DROP VIEW IF EXISTS v_historial_servicios_cliente;
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS cita_servicios;
DROP TABLE IF EXISTS citas;
DROP TABLE IF EXISTS servicios;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS horarios_empleado;
DROP TABLE IF EXISTS empleados;
DROP TABLE IF EXISTS usuarios;
