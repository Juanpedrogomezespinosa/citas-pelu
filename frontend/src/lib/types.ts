/**
 * Contratos de datos de la API (reflejo de los modelos del backend).
 * Las fechas llegan como strings ISO 8601.
 */

export type Rol = 'admin' | 'recepcion' | 'empleado';

export const ROL_LABEL: Readonly<Record<Rol, string>> = { admin: 'Administración', recepcion: 'Recepción', empleado: 'Estilista' };

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  debe_cambiar_password: boolean;
}

export interface UsuarioAdmin extends Usuario {
  activo: boolean;
  ultimo_acceso: string | null;
}

export interface UsuarioConPasswordTemporal {
  usuario: Usuario;
  password_temporal: string;
}

export const TIPOS_CABELLO = ['liso', 'ondulado', 'rizado', 'afro', 'otro'] as const;
export const SENSIBILIDADES = ['ninguna', 'baja', 'media', 'alta'] as const;
export type TipoCabello = (typeof TIPOS_CABELLO)[number];
export type Sensibilidad = (typeof SENSIBILIDADES)[number];

export interface Cliente {
  id: number;
  nombre: string;
  apellidos: string | null;
  /** null si el cliente fue anonimizado (RGPD) */
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  acepta_whatsapp: boolean;
  tipo_cabello: TipoCabello | null;
  color_preferido: string | null;
  tipo_corte_preferido: string | null;
  sensibilidad_cuero_cabelludo: Sensibilidad;
  alergias: string | null;
  productos_preferidos: string | null;
  notas: string | null;
  activo: boolean;
  anonimizado_en: string | null;
}

/** Lo que envía el formulario de cliente (strings vacíos = sin dato) */
export interface ClienteInput {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  fecha_nacimiento: string;
  acepta_whatsapp: boolean;
  tipo_cabello: TipoCabello | '';
  color_preferido: string;
  tipo_corte_preferido: string;
  sensibilidad_cuero_cabelludo: Sensibilidad;
  alergias: string;
  productos_preferidos: string;
  notas: string;
}

export interface Servicio {
  id: number;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
}

export interface Empleado {
  id: number;
  usuario_id: number | null;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  especialidad: string | null;
  color_calendario: string;
  activo: boolean;
}

/** dia_semana: 0 = domingo ... 6 = sábado */
export interface TramoHorario {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface EmpleadoDetalle extends Empleado {
  horarios: TramoHorario[];
}

export const CATEGORIAS_SERVICIO = ['corte', 'color', 'tratamiento', 'peinado', 'barberia', 'otros'] as const;

export const TIPOS_BLOQUEO = ['vacaciones', 'festivo', 'baja', 'formacion', 'otro'] as const;
export type TipoBloqueo = (typeof TIPOS_BLOQUEO)[number];

export interface Bloqueo {
  id: number;
  empleado_id: number | null;
  empleado_nombre: string | null;
  tipo: TipoBloqueo;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
}

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

export interface CitaServicio {
  servicio_id: number;
  nombre: string;
  categoria: string;
  precio: number;
  duracion_minutos: number;
  notas_tecnicas: string | null;
}

export interface Cita {
  id: number;
  cliente_id: number;
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoCita;
  notas: string | null;
  motivo_cancelacion: string | null;
  confirmada_via: 'manual' | 'whatsapp' | null;
  recordatorio_enviado: boolean;
  version: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_acepta_whatsapp: boolean;
  empleado_nombre: string;
  empleado_color: string;
  precio_total: number;
  cobrada: boolean;
  servicios: CitaServicio[];
}

export interface CitaInput {
  cliente_id: number;
  empleado_id: number;
  fecha_inicio: string; // 'YYYY-MM-DDTHH:mm' hora local del salón
  servicios: number[];
  notas: string;
}

export type EstadoNotificacion = 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'recibido';

export interface Notificacion {
  id: number;
  cita_id: number | null;
  cliente_id: number | null;
  tipo: string;
  direccion: 'saliente' | 'entrante';
  telefono: string;
  mensaje: string;
  estado: EstadoNotificacion;
  respuesta_interpretada: 'confirmar' | 'cancelar' | 'desconocida' | null;
  plantilla_clave: string | null;
  intentos: number;
  error: string | null;
  created_at: string;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  activo: boolean;
}

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
  fecha: string;
  metodo: MetodoPago;
  estado: 'pagado' | 'anulado';
  subtotal: number;
  descuento: number;
  total: number;
  notas: string | null;
  motivo_anulacion: string | null;
  registrado_por_nombre: string | null;
  lineas: CobroLinea[];
}

export type NuevaLineaCobro =
  | { tipo: 'servicio'; servicio_id: number; cantidad: number; precio_unitario?: number; empleado_id?: number | null }
  | { tipo: 'producto'; producto_id: number; cantidad: number; precio_unitario?: number };

export interface NuevoCobro {
  cita_id?: number | null;
  cliente_id?: number | null;
  metodo: MetodoPago;
  descuento: number;
  lineas: NuevaLineaCobro[];
  notas?: string;
}

export interface InformeCaja {
  resumen: { num_cobros: number; bruto: number; descuentos: number; neto: number };
  por_metodo: { metodo: MetodoPago; num_cobros: number; neto: number }[];
  por_dia: { fecha: string; neto: number }[];
  por_servicio: { servicio_id: number; nombre: string; cantidad: number; importe: number }[];
  por_profesional: { empleado_id: number | null; nombre: string; importe: number }[];
  por_producto: { producto_id: number; nombre: string; cantidad: number; importe: number }[];
}

/** Citas que impiden una operación (baja, bloqueo, anonimización) */
export interface CitaAfectada {
  id: number;
  fecha_inicio: string;
  cliente_nombre?: string;
  empleado_nombre?: string;
}

export interface VisitaHistorial {
  cita_id: number;
  fecha_inicio: string;
  estado: EstadoCita;
  empleado_nombre: string;
  notas_cita: string | null;
  total: number;
  servicios: { servicio_id: number; servicio_nombre: string; categoria: string; precio: number; notas_tecnicas: string | null }[];
}

export interface HistorialCliente {
  estadisticas: {
    total_visitas: number;
    gasto_total: number;
    ultima_visita: string | null;
    proxima_cita: string | null;
    no_asistencias: number;
    servicio_favorito: string | null;
  };
  visitas: VisitaHistorial[];
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/** Errores de validación por campo: { campo: mensaje } */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;
