import type { ActualizarServicioDto, CrearServicioDto, ListarServiciosQuery } from '../dtos/servicio.dto.js';
import { ServicioModel, type Servicio } from '../models/servicio.model.js';
import { AppError } from '../utils/app-error.js';

export const ServicioService = {
  listar(query: ListarServiciosQuery): Promise<Servicio[]> {
    return ServicioModel.list({ incluirInactivos: query.incluir_inactivos });
  },

  async obtener(id: number): Promise<Servicio> {
    const servicio = await ServicioModel.findById(id);
    if (!servicio) throw AppError.notFound('Servicio');
    return servicio;
  },

  async crear(dto: CrearServicioDto): Promise<Servicio> {
    return this.obtener(await ServicioModel.create(dto));
  },

  /** Cambiar precio/duración no altera citas existentes: cita_servicios guarda su propia copia */
  async actualizar(id: number, dto: ActualizarServicioDto): Promise<Servicio> {
    if (!(await ServicioModel.update(id, dto))) throw AppError.notFound('Servicio');
    return this.obtener(id);
  },

  async desactivar(id: number): Promise<void> {
    if (!(await ServicioModel.update(id, { activo: false }))) throw AppError.notFound('Servicio');
  },
} as const;
