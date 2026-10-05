/**
 * Utilidades de los tests de integración: base de datos limpia con
 * migraciones reales, datos de partida y cliente HTTP con sesión por cookie.
 */
import mysql from 'mysql2/promise';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { pool, run } from '../../src/config/database.js';
import { crearMigrador } from '../../src/db/migrator.js';
import { AuthService } from '../../src/services/auth.service.js';
import { OutboxWorker } from '../../src/services/outbox.service.js';

export const ORIGEN = 'http://localhost:4321';
export const PASSWORD = 'PasswordDeTest123';

export interface Fixtures {
  adminEmail: string;
  recepcionEmail: string;
  empleadoId: number;
  empleado2Id: number;
  corteId: number;
  tinteId: number;
  clienteId: number;
  clienteTelefono: string;
  productoId: number;
}

let app: Express | null = null;
export const getApp = (): Express => (app ??= createApp());

/** Borra y recrea la base de datos de test aplicando TODAS las migraciones */
export async function prepararBaseDeDatos(): Promise<Fixtures> {
  const admin = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD });
  await admin.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
  await admin.query(`CREATE DATABASE \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const migrador = crearMigrador();
  await migrador.migrate.latest();
  await migrador.destroy();

  const hash = await AuthService.hashPassword(PASSWORD);
  await run(pool, "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ('Admin', 'admin@test.local', ?, 'admin')", [hash]);
  await run(pool, "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ('Recepción', 'recepcion@test.local', ?, 'recepcion')", [
    hash,
  ]);
  // Empleados sin horario propio: trabajan todo el horario del local, todos los días
  const e1 = await run(pool, "INSERT INTO empleados (nombre) VALUES ('Lucía')");
  const e2 = await run(pool, "INSERT INTO empleados (nombre) VALUES ('Carlos')");
  const corte = await run(pool, "INSERT INTO servicios (nombre, categoria, duracion_minutos, precio) VALUES ('Corte', 'corte', 30, 20.00)");
  const tinte = await run(pool, "INSERT INTO servicios (nombre, categoria, duracion_minutos, precio) VALUES ('Tinte', 'color', 60, 35.50)");
  const cliente = await run(pool, "INSERT INTO clientes (nombre, apellidos, telefono) VALUES ('Ana', 'García', '+34611111111')");
  const producto = await run(pool, "INSERT INTO productos (nombre, precio, stock) VALUES ('Champú', 12.50, 3)");

  return {
    adminEmail: 'admin@test.local',
    recepcionEmail: 'recepcion@test.local',
    empleadoId: e1.insertId,
    empleado2Id: e2.insertId,
    corteId: corte.insertId,
    tinteId: tinte.insertId,
    clienteId: cliente.insertId,
    clienteTelefono: '+34611111111',
    productoId: producto.insertId,
  };
}

export async function cerrar(): Promise<void> {
  await OutboxWorker.procesarAhora().catch(() => undefined);
  await pool.end();
}

/**
 * Cliente HTTP con sesión (cookie) y cabecera Origin en todas las peticiones,
 * como haría el navegador del panel.
 */
export function cliente() {
  const agent = request.agent(getApp());
  const conOrigen = <T extends request.Test>(t: T): T => t.set('Origin', ORIGEN);
  return {
    agent,
    get: (url: string) => conOrigen(agent.get(url)),
    post: (url: string, body?: object) => conOrigen(agent.post(url)).send(body ?? {}),
    put: (url: string, body?: object) => conOrigen(agent.put(url)).send(body ?? {}),
    patch: (url: string, body?: object) => conOrigen(agent.patch(url)).send(body ?? {}),
    delete: (url: string) => conOrigen(agent.delete(url)),
  };
}

export type Cliente = ReturnType<typeof cliente>;

export async function sesion(email: string, password = PASSWORD): Promise<Cliente> {
  const c = cliente();
  const res = await c.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login fallido (${res.status}): ${JSON.stringify(res.body)}`);
  return c;
}

/** 'YYYY-MM-DD' de dentro de N días (hora local) */
export function diaFuturo(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inserta directamente una cita ya pasada (la API no permite reservar en el pasado) */
export async function crearCitaPasada(f: Fixtures, servicioId = f.corteId): Promise<number> {
  const inicio = new Date(Date.now() - 2 * 3_600_000);
  const fin = new Date(inicio.getTime() + 30 * 60_000);
  const cita = await run(
    pool,
    "INSERT INTO citas (cliente_id, empleado_id, fecha_inicio, fecha_fin, estado, created_at) VALUES (?, ?, ?, ?, 'confirmada', ?)",
    [f.clienteId, f.empleadoId, inicio, fin, new Date(inicio.getTime() - 86_400_000)],
  );
  await run(
    pool,
    'INSERT INTO cita_servicios (cita_id, servicio_id, precio, duracion_minutos) SELECT ?, id, precio, duracion_minutos FROM servicios WHERE id = ?',
    [cita.insertId, servicioId],
  );
  return cita.insertId;
}
