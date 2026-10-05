import type { ActualizarProductoDto, CrearProductoDto, ListarProductosQuery } from '../dtos/caja.dto.js';
import { ProductoModel, type Producto } from '../models/producto.model.js';
import { AppError } from '../utils/app-error.js';

export const ProductoService = {
  listar(query: ListarProductosQuery): Promise<Producto[]> {
    return ProductoModel.list({ incluirInactivos: query.incluir_inactivos });
  },

  async obtener(id: number): Promise<Producto> {
    const producto = await ProductoModel.findById(id);
    if (!producto) throw AppError.notFound('Producto');
    return producto;
  },

  async crear(dto: CrearProductoDto): Promise<Producto> {
    return this.obtener(await ProductoModel.create(dto));
  },

  async actualizar(id: number, dto: ActualizarProductoDto): Promise<Producto> {
    if (!(await ProductoModel.update(id, dto))) throw AppError.notFound('Producto');
    return this.obtener(id);
  },
} as const;
