/**
 * Datos iniciales (idempotente: se puede ejecutar varias veces).
 *   1. Usuario administrador desde ADMIN_EMAIL / ADMIN_PASSWORD del .env
 *   2. Datos de ejemplo (servicios, empleados con horario, clientes) solo si
 *      la tabla de servicios está vacía.
 *
 * Uso: npm run db:seed   (requiere haber ejecutado antes npm run db:migrate)
 */
import { env } from '../config/env.js';
import { pool, run, selectOne, withTransaction } from '../config/database.js';
import { passwordPolicy } from '../dtos/auth.dto.js';
import { EmpleadoModel } from '../models/empleado.model.js';
import { UsuarioModel } from '../models/usuario.model.js';
import { AuthService } from '../services/auth.service.js';

async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log('⏭️  ADMIN_EMAIL/ADMIN_PASSWORD no definidos: no se crea administrador');
    return;
  }
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  if (await UsuarioModel.findByEmailWithPassword(email)) {
    console.log(`✔️  El administrador ${email} ya existe`);
    return;
  }
  const policy = passwordPolicy.safeParse(env.ADMIN_PASSWORD);
  if (!policy.success) {
    throw new Error(`ADMIN_PASSWORD no cumple la política: ${policy.error.issues.map((i) => i.message).join(', ')}`);
  }
  await UsuarioModel.create({
    nombre: env.ADMIN_NAME,
    email,
    passwordHash: await AuthService.hashPassword(env.ADMIN_PASSWORD),
    rol: 'admin',
  });
  console.log(`✅ Administrador creado: ${email}`);
}

const SERVICIOS = [
  ['Corte mujer', 'Lavado, corte y secado', 'corte', 45, 28],
  ['Corte hombre', 'Corte con máquina y tijera', 'corte', 30, 16],
  ['Corte infantil', 'Menores de 12 años', 'corte', 20, 12],
  ['Tinte raíz', 'Aplicación de color en raíz', 'color', 60, 35],
  ['Mechas balayage', 'Técnica a mano alzada con matizado', 'color', 150, 95],
  ['Tratamiento hidratante', 'Mascarilla profunda y masaje capilar', 'tratamiento', 30, 22],
  ['Peinado evento', 'Recogido u ondas para ocasiones especiales', 'peinado', 60, 40],
  ['Arreglo de barba', 'Perfilado con navaja y toalla caliente', 'barberia', 20, 10],
] as const;

const PRODUCTOS = [
  ['Champú reparador 300 ml', 14.9, 12],
  ['Mascarilla hidratante 200 ml', 18.5, 8],
  ['Sérum anti-encrespamiento', 22, 5],
  ['Laca fijación fuerte', 9.95, 2],
] as const;

const MARTES_A_SABADO = [2, 3, 4, 5, 6];
const LUNES_A_VIERNES = [1, 2, 3, 4, 5];

const EMPLEADOS = [
  {
    nombre: 'Lucía',
    apellidos: 'Martín',
    telefono: '+34600000001',
    especialidad: 'Color y balayage',
    color: '#9F1239',
    horarios: MARTES_A_SABADO.map((d) => ({ dia_semana: d, hora_inicio: '09:30', hora_fin: '18:30' })),
  },
  {
    nombre: 'Carlos',
    apellidos: 'Ruiz',
    telefono: '+34600000002',
    especialidad: 'Barbería y corte masculino',
    color: '#0F766E',
    horarios: LUNES_A_VIERNES.flatMap((d) => [
      { dia_semana: d, hora_inicio: '09:00', hora_fin: '14:00' },
      { dia_semana: d, hora_inicio: '16:00', hora_fin: '20:00' },
    ]),
  },
  {
    nombre: 'Marta',
    apellidos: 'Navarro',
    telefono: '+34600000003',
    especialidad: 'Peinados y tratamientos',
    color: '#7C3AED',
    horarios: MARTES_A_SABADO.map((d) => ({ dia_semana: d, hora_inicio: '09:30', hora_fin: '18:30' })),
  },
];

const CLIENTES = [
  [
    'Ana',
    'García López',
    '+34611111111',
    'ana@example.com',
    'ondulado',
    'Castaño chocolate 5.35',
    'Melena por los hombros, capas suaves',
    'media',
    'PPD (parafenilendiamina): usar tintes sin amoniaco',
    'Prefiere citas por la mañana.',
  ],
  ['Javier', 'Pérez', '+34622222222', null, 'liso', null, 'Degradado bajo, 2 en laterales', 'ninguna', null, 'Viene cada 3 semanas.'],
  [
    'Elena',
    'Sánchez',
    '+34633333333',
    'elena@example.com',
    'rizado',
    'Cobrizo natural',
    'Corte en seco para rizos',
    'alta',
    null,
    'Cuero cabelludo muy sensible: agua templada, sin masaje enérgico.',
  ],
] as const;

async function seedDatosEjemplo(): Promise<void> {
  const existentes = await selectOne<{ total: number }>(pool, 'SELECT COUNT(*) AS total FROM servicios');
  if ((existentes?.total ?? 0) > 0) {
    console.log('✔️  Ya hay datos: se omiten los datos de ejemplo');
    return;
  }

  // Todo o nada: si algo falla no quedan datos de ejemplo a medias
  await withTransaction(async (conn) => {
    for (const [nombre, descripcion, categoria, duracion, precio] of SERVICIOS) {
      await run(conn, 'INSERT INTO servicios (nombre, descripcion, categoria, duracion_minutos, precio) VALUES (?, ?, ?, ?, ?)', [
        nombre,
        descripcion,
        categoria,
        duracion,
        precio,
      ]);
    }
    for (const e of EMPLEADOS) {
      const id = await EmpleadoModel.create(
        { nombre: e.nombre, apellidos: e.apellidos, telefono: e.telefono, especialidad: e.especialidad, color_calendario: e.color },
        conn,
      );
      await EmpleadoModel.replaceHorarios(id, e.horarios, conn);
    }
    for (const [nombre, precio, stock] of PRODUCTOS) {
      await run(conn, 'INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)', [nombre, precio, stock]);
    }
    for (const c of CLIENTES) {
      await run(
        conn,
        `INSERT INTO clientes (nombre, apellidos, telefono, email, tipo_cabello, color_preferido, tipo_corte_preferido,
                               sensibilidad_cuero_cabelludo, alergias, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...c],
      );
    }
  });
  console.log(
    `✅ Datos de ejemplo: ${SERVICIOS.length} servicios, ${EMPLEADOS.length} empleados, ${CLIENTES.length} clientes, ${PRODUCTOS.length} productos`,
  );
}

try {
  await seedAdmin();
  await seedDatosEjemplo();
} catch (error) {
  console.error('❌ Error en el seed:', (error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
