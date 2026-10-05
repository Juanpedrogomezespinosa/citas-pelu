import { z } from 'zod';
import { METODOS_PAGO } from '../models/cobro.model.js';
import { dateString, optionalText, positiveInt, queryBool, requiredText } from './common.dto.js';

const importe = z.coerce
  .number()
  .min(0, 'No puede ser negativo')
  .max(99999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 decimales');

// ------------------------------------------------------------------ productos

const camposProducto = {
  nombre: requiredText(120),
  descripcion: optionalText(500),
  precio: importe,
  stock: z.coerce.number().int().min(0).max(1_000_000),
  activo: z.boolean(),
};

export const crearProductoSchema = z.object({
  ...camposProducto,
  stock: camposProducto.stock.default(0),
  activo: camposProducto.activo.default(true),
});
export type CrearProductoDto = z.infer<typeof crearProductoSchema>;

export const actualizarProductoSchema = z
  .object(camposProducto)
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Indica al menos un campo a modificar');
export type ActualizarProductoDto = z.infer<typeof actualizarProductoSchema>;

export const listarProductosQuerySchema = z.object({ incluir_inactivos: queryBool.optional() });
export type ListarProductosQuery = z.infer<typeof listarProductosQuerySchema>;

// --------------------------------------------------------------------- cobros

const lineaServicio = z.object({
  tipo: z.literal('servicio'),
  servicio_id: positiveInt,
  cantidad: z.coerce.number().int().min(1).max(99).default(1),
  /** Opcional: si no se indica se usa el precio de la cita o del catálogo */
  precio_unitario: importe.optional(),
  empleado_id: positiveInt.nullable().optional(),
});

const lineaProducto = z.object({
  tipo: z.literal('producto'),
  producto_id: positiveInt,
  cantidad: z.coerce.number().int().min(1).max(99).default(1),
  precio_unitario: importe.optional(),
});

export const crearCobroSchema = z
  .object({
    cita_id: positiveInt.nullable().optional(),
    cliente_id: positiveInt.nullable().optional(),
    metodo: z.enum(METODOS_PAGO),
    descuento: importe.default(0),
    lineas: z
      .array(z.discriminatedUnion('tipo', [lineaServicio, lineaProducto]))
      .min(1, 'Añade al menos una línea')
      .max(30),
    notas: optionalText(500),
  })
  .refine((c) => !(c.cita_id && c.cliente_id), { message: 'Indica la cita o el cliente, no ambos', path: ['cliente_id'] });
export type CrearCobroDto = z.infer<typeof crearCobroSchema>;

export const anularCobroSchema = z.object({ motivo: requiredText(300) });
export type AnularCobroDto = z.infer<typeof anularCobroSchema>;

export const rangoFechasQuerySchema = z
  .object({
    desde: dateString,
    hasta: dateString,
    incluir_anulados: queryBool.optional(),
  })
  .refine((q) => q.desde <= q.hasta, { message: '"desde" debe ser anterior a "hasta"', path: ['hasta'] });
export type RangoFechasQuery = z.infer<typeof rangoFechasQuerySchema>;
