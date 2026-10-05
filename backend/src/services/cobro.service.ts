/**
 * Caja: cobros de citas y ventas de productos.
 *
 * Un cobro es una operación multi-tabla que debe ser atómica:
 *   validar cita + bloquear productos + descontar stock + insertar cobro y líneas.
 * Si falta stock de un producto, no se cobra nada ni se toca ningún stock.
 *
 * Los precios se resuelven SIEMPRE en el servidor (precio congelado de la cita
 * o del catálogo). Solo se acepta un precio distinto si se envía explícitamente
 * (p. ej. un suplemento), y queda registrado en la línea.
 */
import { withTransaction } from '../config/database.js';
import type { AnularCobroDto, CrearCobroDto, RangoFechasQuery } from '../dtos/caja.dto.js';
import { CitaModel } from '../models/cita.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { CobroModel, type Cobro, type InformeCaja, type NuevaLinea } from '../models/cobro.model.js';
import { ProductoModel } from '../models/producto.model.js';
import { ServicioModel } from '../models/servicio.model.js';
import { AppError } from '../utils/app-error.js';
import { addDays, parseLocalDate } from '../utils/dates.js';

const redondear = (n: number) => Math.round(n * 100) / 100;

function rango(query: { desde: string; hasta: string }): { desde: Date; hasta: Date } {
  const desde = parseLocalDate(query.desde);
  const hasta = parseLocalDate(query.hasta);
  if (!desde || !hasta) throw AppError.badRequest('Fecha no válida', 'INVALID_DATE');
  return { desde, hasta: addDays(hasta, 1) }; // `hasta` inclusivo
}

export const CobroService = {
  listar(query: RangoFechasQuery): Promise<Cobro[]> {
    return CobroModel.list({ ...rango(query), incluirAnulados: query.incluir_anulados ?? false });
  },

  async obtener(id: number): Promise<Cobro> {
    const cobro = await CobroModel.findById(id);
    if (!cobro) throw AppError.notFound('Cobro');
    return cobro;
  },

  async crear(dto: CrearCobroDto, usuarioId: number): Promise<Cobro> {
    const ahora = new Date();

    const id = await withTransaction(async (conn) => {
      // 1) Cita (si la hay): debe estar completada y sin cobrar
      let clienteId = dto.cliente_id ?? null;
      const cita = dto.cita_id ? await CitaModel.lockById(dto.cita_id, conn) : null;
      if (dto.cita_id) {
        if (!cita) throw AppError.notFound('Cita');
        if (cita.estado !== 'completada') throw AppError.conflict('Solo se pueden cobrar citas completadas', 'CITA_NO_COMPLETADA');
        if (await CobroModel.findVigenteDeCita(cita.id, conn)) throw AppError.conflict('Esta cita ya está cobrada', 'ALREADY_PAID');
        clienteId = cita.cliente_id;
      } else if (clienteId && !(await ClienteModel.findById(clienteId, conn))) {
        throw AppError.notFound('Cliente');
      }
      const detalleCita = cita ? await CitaModel.findDetalle(cita.id, conn) : null;

      // 2) Servicios: precio congelado de la cita o, si no está en ella, del catálogo
      const lineasServicio = dto.lineas.filter((l) => l.tipo === 'servicio');
      const catalogo = new Map(
        (await ServicioModel.findActiveByIds([...new Set(lineasServicio.map((l) => l.servicio_id))], conn)).map((s) => [s.id, s]),
      );

      // 3) Productos: bloqueados en orden de id para descontar stock sin carreras
      const lineasProducto = dto.lineas.filter((l) => l.tipo === 'producto');
      const productos = new Map(
        (
          await ProductoModel.lockByIds(
            lineasProducto.map((l) => l.producto_id),
            conn,
          )
        ).map((p) => [p.id, p]),
      );

      const lineas: NuevaLinea[] = [];
      for (const l of dto.lineas) {
        if (l.tipo === 'servicio') {
          const enCita = detalleCita?.servicios.find((s) => s.servicio_id === l.servicio_id);
          const servicio = catalogo.get(l.servicio_id);
          if (!enCita && !servicio) throw AppError.badRequest(`El servicio ${l.servicio_id} no existe o no está activo`, 'INVALID_SERVICE');
          lineas.push({
            tipo: 'servicio',
            servicio_id: l.servicio_id,
            producto_id: null,
            empleado_id: l.empleado_id ?? cita?.empleado_id ?? null,
            descripcion: enCita?.nombre ?? servicio!.nombre,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario ?? enCita?.precio ?? servicio!.precio,
          });
        } else {
          const producto = productos.get(l.producto_id);
          if (!producto?.activo) throw AppError.badRequest(`El producto ${l.producto_id} no existe o no está activo`, 'INVALID_PRODUCT');
          // Agrega cantidades si el mismo producto aparece en varias líneas
          const pedido = lineasProducto.filter((x) => x.producto_id === l.producto_id).reduce((t, x) => t + x.cantidad, 0);
          if (producto.stock < pedido) {
            throw AppError.conflict(`Stock insuficiente de "${producto.nombre}" (quedan ${producto.stock})`, 'OUT_OF_STOCK');
          }
          lineas.push({
            tipo: 'producto',
            servicio_id: null,
            producto_id: producto.id,
            empleado_id: null,
            descripcion: producto.nombre,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario ?? producto.precio,
          });
        }
      }

      const subtotal = redondear(lineas.reduce((t, l) => t + l.cantidad * l.precio_unitario, 0));
      if (dto.descuento > subtotal) throw AppError.badRequest('El descuento no puede superar el importe', 'INVALID_DISCOUNT');

      // 4) Descontar stock (la condición stock >= cantidad es una segunda barrera)
      for (const l of lineas) {
        if (l.tipo === 'producto' && !(await ProductoModel.descontarStock(l.producto_id!, l.cantidad, conn))) {
          throw AppError.conflict(`Stock insuficiente de "${l.descripcion}"`, 'OUT_OF_STOCK');
        }
      }

      return CobroModel.insert(
        {
          cita_id: cita?.id ?? null,
          cliente_id: clienteId,
          fecha: ahora,
          metodo: dto.metodo,
          descuento: dto.descuento,
          notas: dto.notas ?? null,
          registrado_por: usuarioId,
        },
        lineas,
        conn,
      );
    });

    return this.obtener(id);
  },

  /** Anula un cobro (no se borra nunca) y devuelve el stock de los productos vendidos */
  async anular(id: number, dto: AnularCobroDto): Promise<Cobro> {
    await withTransaction(async (conn) => {
      const cobro = await CobroModel.lockById(id, conn);
      if (!cobro) throw AppError.notFound('Cobro');
      if (cobro.estado === 'anulado') throw AppError.conflict('El cobro ya está anulado', 'ALREADY_CANCELLED');

      const detalle = await CobroModel.findById(id, conn);
      for (const l of detalle?.lineas ?? []) {
        if (l.tipo === 'producto' && l.producto_id) await ProductoModel.reponerStock(l.producto_id, l.cantidad, conn);
      }
      await CobroModel.anular(id, dto.motivo, new Date(), conn);
    });
    return this.obtener(id);
  },

  informe(query: RangoFechasQuery): Promise<InformeCaja> {
    const { desde, hasta } = rango(query);
    return CobroModel.informe(desde, hasta);
  },
} as const;
