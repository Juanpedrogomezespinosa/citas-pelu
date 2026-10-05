/**
 * Caja: cobros y sus líneas, más las consultas de informes.
 * 3FN: el importe de un cobro se calcula siempre desde sus líneas.
 */
import { placeholders, pool, run, select, selectOne, type Db, type SqlParam } from '../config/database.js';

export const METODOS_PAGO = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export interface CobroLinea {
  id: number;
  tipo: 'servicio' | 'producto';
  servicio_id: number | null;
  producto_id: number | null;
  empleado_id: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Cobro {
  id: number;
  cita_id: number | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  fecha: Date;
  metodo: MetodoPago;
  estado: 'pagado' | 'anulado';
  /** Derivado: suma de cantidad * precio_unitario de las líneas */
  subtotal: number;
  descuento: number;
  /** Derivado: subtotal - descuento */
  total: number;
  notas: string | null;
  anulado_en: Date | null;
  motivo_anulacion: string | null;
  registrado_por_nombre: string | null;
  lineas: CobroLinea[];
}

export type NuevaLinea = Omit<CobroLinea, 'id'>;

const SELECT = `
  SELECT co.id, co.cita_id, co.cliente_id, CONCAT_WS(' ', cl.nombre, cl.apellidos) AS cliente_nombre,
         co.fecha, co.metodo, co.estado, co.descuento, co.notas, co.anulado_en, co.motivo_anulacion,
         u.nombre AS registrado_por_nombre,
         COALESCE((SELECT SUM(l.cantidad * l.precio_unitario) FROM cobro_lineas l WHERE l.cobro_id = co.id), 0) AS subtotal
    FROM cobros co
    LEFT JOIN clientes cl ON cl.id = co.cliente_id
    LEFT JOIN usuarios u ON u.id = co.registrado_por`;

type CobroFila = Omit<Cobro, 'lineas' | 'total'>;

async function conLineas(cobros: CobroFila[], db: Db): Promise<Cobro[]> {
  if (cobros.length === 0) return [];
  const ids = cobros.map((c) => c.id);
  const lineas = await select<CobroLinea & { cobro_id: number }>(
    db,
    `SELECT id, cobro_id, tipo, servicio_id, producto_id, empleado_id, descripcion, cantidad, precio_unitario
       FROM cobro_lineas WHERE cobro_id IN (${placeholders(ids.length)}) ORDER BY id`,
    ids,
  );
  const porCobro = Map.groupBy(lineas, (l) => l.cobro_id);
  return cobros.map((c) => {
    const subtotal = Number(c.subtotal);
    return {
      ...c,
      subtotal,
      total: Math.round((subtotal - c.descuento) * 100) / 100,
      lineas: (porCobro.get(c.id) ?? []).map(({ cobro_id: _cobroId, ...linea }) => linea),
    };
  });
}

export interface InformeCaja {
  resumen: { num_cobros: number; bruto: number; descuentos: number; neto: number };
  por_metodo: { metodo: MetodoPago; num_cobros: number; neto: number }[];
  por_dia: { fecha: string; neto: number }[];
  por_servicio: { servicio_id: number; nombre: string; cantidad: number; importe: number }[];
  por_profesional: { empleado_id: number | null; nombre: string; importe: number }[];
  por_producto: { producto_id: number; nombre: string; cantidad: number; importe: number }[];
}

export const CobroModel = {
  async findById(id: number, db: Db = pool): Promise<Cobro | null> {
    const fila = await selectOne<CobroFila>(db, `${SELECT} WHERE co.id = ?`, [id]);
    if (!fila) return null;
    const [cobro] = await conLineas([fila], db);
    return cobro ?? null;
  },

  lockById(id: number, db: Db): Promise<{ id: number; estado: 'pagado' | 'anulado' } | null> {
    return selectOne(db, 'SELECT id, estado FROM cobros WHERE id = ? FOR UPDATE', [id]);
  },

  findVigenteDeCita(citaId: number, db: Db = pool): Promise<{ id: number } | null> {
    return selectOne(db, 'SELECT id FROM cobros WHERE cita_cobrada = ?', [citaId]);
  },

  async list(f: { desde: Date; hasta: Date; incluirAnulados: boolean }, db: Db = pool): Promise<Cobro[]> {
    const filas = await select<CobroFila>(
      db,
      `${SELECT} WHERE co.fecha >= ? AND co.fecha < ? ${f.incluirAnulados ? '' : "AND co.estado = 'pagado'"} ORDER BY co.fecha DESC, co.id DESC LIMIT 1000`,
      [f.desde, f.hasta],
    );
    return conLineas(filas, db);
  },

  listDeCliente(clienteId: number, db: Db = pool): Promise<Cobro[]> {
    return select<CobroFila>(db, `${SELECT} WHERE co.cliente_id = ? ORDER BY co.fecha`, [clienteId]).then((f) => conLineas(f, db));
  },

  async insert(
    data: {
      cita_id: number | null;
      cliente_id: number | null;
      fecha: Date;
      metodo: MetodoPago;
      descuento: number;
      notas: string | null;
      registrado_por: number | null;
    },
    lineas: readonly NuevaLinea[],
    db: Db,
  ): Promise<number> {
    const result = await run(
      db,
      'INSERT INTO cobros (cita_id, cliente_id, fecha, metodo, descuento, notas, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.cita_id, data.cliente_id, data.fecha, data.metodo, data.descuento, data.notas, data.registrado_por],
    );
    for (const l of lineas) {
      await run(
        db,
        `INSERT INTO cobro_lineas (cobro_id, tipo, servicio_id, producto_id, empleado_id, descripcion, cantidad, precio_unitario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, l.tipo, l.servicio_id, l.producto_id, l.empleado_id, l.descripcion, l.cantidad, l.precio_unitario],
      );
    }
    return result.insertId;
  },

  async anular(id: number, motivo: string | null, ahora: Date, db: Db): Promise<void> {
    await run(db, "UPDATE cobros SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ? WHERE id = ?", [ahora, motivo, id]);
  },

  /** Informe de caja de [desde, hasta) sobre cobros vigentes */
  async informe(desde: Date, hasta: Date, db: Db = pool): Promise<InformeCaja> {
    const rango: SqlParam[] = [desde, hasta];
    const VIGENTES = "co.estado = 'pagado' AND co.fecha >= ? AND co.fecha < ?";
    const IMPORTE_COBRO = '(SELECT COALESCE(SUM(l.cantidad * l.precio_unitario), 0) FROM cobro_lineas l WHERE l.cobro_id = co.id)';

    const [resumen, porMetodo, porDia, porServicio, porProfesional, porProducto] = await Promise.all([
      selectOne<{ num_cobros: number; bruto: number; descuentos: number }>(
        db,
        `SELECT COUNT(*) AS num_cobros, COALESCE(SUM(${IMPORTE_COBRO}), 0) AS bruto, COALESCE(SUM(co.descuento), 0) AS descuentos
           FROM cobros co WHERE ${VIGENTES}`,
        rango,
      ),
      select<{ metodo: MetodoPago; num_cobros: number; neto: number }>(
        db,
        `SELECT co.metodo, COUNT(*) AS num_cobros, SUM(${IMPORTE_COBRO} - co.descuento) AS neto
           FROM cobros co WHERE ${VIGENTES} GROUP BY co.metodo ORDER BY neto DESC`,
        rango,
      ),
      select<{ fecha: string; neto: number }>(
        db,
        `SELECT DATE_FORMAT(co.fecha, '%Y-%m-%d') AS fecha, SUM(${IMPORTE_COBRO} - co.descuento) AS neto
           FROM cobros co WHERE ${VIGENTES} GROUP BY DATE_FORMAT(co.fecha, '%Y-%m-%d') ORDER BY fecha`,
        rango,
      ),
      // Los desgloses por línea son importes brutos (el descuento es del ticket completo)
      select<{ servicio_id: number; nombre: string; cantidad: number; importe: number }>(
        db,
        `SELECT l.servicio_id, s.nombre, SUM(l.cantidad) AS cantidad, SUM(l.cantidad * l.precio_unitario) AS importe
           FROM cobro_lineas l JOIN cobros co ON co.id = l.cobro_id JOIN servicios s ON s.id = l.servicio_id
          WHERE l.tipo = 'servicio' AND ${VIGENTES}
          GROUP BY l.servicio_id, s.nombre ORDER BY importe DESC`,
        rango,
      ),
      select<{ empleado_id: number | null; nombre: string; importe: number }>(
        db,
        `SELECT l.empleado_id, COALESCE(CONCAT_WS(' ', e.nombre, e.apellidos), 'Sin asignar') AS nombre,
                SUM(l.cantidad * l.precio_unitario) AS importe
           FROM cobro_lineas l JOIN cobros co ON co.id = l.cobro_id LEFT JOIN empleados e ON e.id = l.empleado_id
          WHERE l.tipo = 'servicio' AND ${VIGENTES}
          GROUP BY l.empleado_id, nombre ORDER BY importe DESC`,
        rango,
      ),
      select<{ producto_id: number; nombre: string; cantidad: number; importe: number }>(
        db,
        `SELECT l.producto_id, p.nombre, SUM(l.cantidad) AS cantidad, SUM(l.cantidad * l.precio_unitario) AS importe
           FROM cobro_lineas l JOIN cobros co ON co.id = l.cobro_id JOIN productos p ON p.id = l.producto_id
          WHERE l.tipo = 'producto' AND ${VIGENTES}
          GROUP BY l.producto_id, p.nombre ORDER BY importe DESC`,
        rango,
      ),
    ]);

    const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
    const bruto = n(resumen?.bruto);
    const descuentos = n(resumen?.descuentos);
    return {
      resumen: { num_cobros: Number(resumen?.num_cobros ?? 0), bruto, descuentos, neto: n(bruto - descuentos) },
      por_metodo: porMetodo.map((r) => ({ ...r, num_cobros: Number(r.num_cobros), neto: n(r.neto) })),
      por_dia: porDia.map((r) => ({ ...r, neto: n(r.neto) })),
      por_servicio: porServicio.map((r) => ({ ...r, cantidad: Number(r.cantidad), importe: n(r.importe) })),
      por_profesional: porProfesional.map((r) => ({ ...r, importe: n(r.importe) })),
      por_producto: porProducto.map((r) => ({ ...r, cantidad: Number(r.cantidad), importe: n(r.importe) })),
    };
  },
} as const;
