/**
 * Cliente HTTP tipado de la API (fetch nativo, sin dependencias).
 *
 * - La sesión viaja en una cookie httpOnly (credentials: 'include'); el
 *   frontend nunca ve ni guarda el token.
 * - Desenvuelve el envelope { success, data, meta } y convierte los errores en
 *   ApiError con su código, los errores por campo y los detalles (p. ej. las
 *   citas que impiden una baja).
 * - 401 -> al login. 403 PASSWORD_CHANGE_REQUIRED -> a cambiar la contraseña.
 */
import { olvidarUsuario } from './session';
import type {
  Bloqueo,
  Cita,
  CitaInput,
  Cliente,
  ClienteInput,
  Cobro,
  Empleado,
  EmpleadoDetalle,
  EstadoCita,
  HistorialCliente,
  InformeCaja,
  Notificacion,
  NuevoCobro,
  PageMeta,
  Paginated,
  Producto,
  Rol,
  Servicio,
  TipoBloqueo,
  TramoHorario,
  Usuario,
  UsuarioAdmin,
  UsuarioConPasswordTemporal,
} from './types';

const API_URL = (import.meta.env.PUBLIC_API_URL ?? '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string> = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PageMeta;
  error?: { message: string; code: string; details?: { fields?: Record<string, string> } & Record<string, unknown> };
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_URL}${path}${qs ? `?${qs}` : ''}`;
}

const RUTAS_PUBLICAS = ['/auth/login', '/auth/me'];

async function request<T>(path: string, { method = 'GET', body, query }: RequestOptions = {}): Promise<{ data: T; meta?: PageMeta }> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor', 0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return { data: undefined as T };
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !payload?.success) {
    const code = payload?.error?.code ?? 'UNKNOWN';
    if (response.status === 401 && !RUTAS_PUBLICAS.includes(path)) {
      olvidarUsuario();
      window.location.assign('/login');
    }
    if (code === 'PASSWORD_CHANGE_REQUIRED' && window.location.pathname !== '/cuenta') {
      window.location.assign('/cuenta?forzado=1');
    }
    const { fields, ...details } = payload?.error?.details ?? {};
    throw new ApiError(payload?.error?.message ?? 'Error inesperado', response.status, code, fields ?? {}, details);
  }
  return payload.meta ? { data: payload.data, meta: payload.meta } : { data: payload.data };
}

const get = async <T>(path: string, query?: Query) => (await request<T>(path, query ? { query } : {})).data;
const send = async <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, query?: Query) =>
  (await request<T>(path, { method, ...(body === undefined ? {} : { body }), ...(query ? { query } : {}) })).data;

async function paginated<T>(path: string, query: Query): Promise<Paginated<T>> {
  const { data, meta } = await request<T[]>(path, { query });
  return { items: data, meta: meta ?? { page: 1, limit: data.length, total: data.length, totalPages: 1 } };
}

/** Los campos vacíos del formulario se envían como null */
const nullIfEmpty = <T extends object>(input: T) => Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]));

export interface ServicioInput {
  nombre: string;
  descripcion: string;
  categoria: string;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
}

export interface EmpleadoInput {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  especialidad: string;
  color_calendario: string;
}

export interface ProductoInput {
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  activo: boolean;
}

export const api = {
  auth: {
    login: (email: string, password: string) => send<Usuario>('POST', '/auth/login', { email, password }),
    me: () => get<Usuario>('/auth/me'),
    cambiarPassword: (actual: string, nueva: string) => send<Usuario>('PUT', '/auth/password', { actual, nueva }),
    cerrarTodas: () => send<void>('POST', '/auth/logout-todas'),
  },
  usuarios: {
    list: () => get<UsuarioAdmin[]>('/usuarios'),
    create: (input: { nombre: string; email: string; rol: Rol }) => send<UsuarioConPasswordTemporal>('POST', '/usuarios', input),
    update: (id: number, input: Partial<{ nombre: string; rol: Rol; activo: boolean }>) =>
      send<UsuarioAdmin>('PATCH', `/usuarios/${id}`, input),
    restablecerPassword: (id: number) => send<UsuarioConPasswordTemporal>('POST', `/usuarios/${id}/restablecer-password`),
  },
  clientes: {
    list: (query: { q?: string; page?: number; limit?: number; incluir_inactivos?: boolean }) => paginated<Cliente>('/clientes', query),
    get: (id: number) => get<Cliente>(`/clientes/${id}`),
    historial: (id: number) => get<HistorialCliente>(`/clientes/${id}/historial`),
    create: (input: ClienteInput) => send<Cliente>('POST', '/clientes', nullIfEmpty(input)),
    update: (id: number, input: ClienteInput) => send<Cliente>('PUT', `/clientes/${id}`, nullIfEmpty(input)),
    desactivar: (id: number, cancelarCitas = false) =>
      send<void>('DELETE', `/clientes/${id}`, undefined, { cancelar_citas: cancelarCitas }),
    reactivar: (id: number) => send<Cliente>('POST', `/clientes/${id}/reactivar`),
    exportar: (id: number) => get<unknown>(`/clientes/${id}/exportar`),
    anonimizar: (id: number) => send<Cliente>('POST', `/clientes/${id}/anonimizar`),
  },
  servicios: {
    list: (incluirInactivos = false) => get<Servicio[]>('/servicios', { incluir_inactivos: incluirInactivos }),
    create: (input: ServicioInput) => send<Servicio>('POST', '/servicios', nullIfEmpty(input)),
    update: (id: number, input: Partial<ServicioInput>) => send<Servicio>('PUT', `/servicios/${id}`, nullIfEmpty(input)),
  },
  empleados: {
    list: (incluirInactivos = false) => get<Empleado[]>('/empleados', { incluir_inactivos: incluirInactivos }),
    get: (id: number) => get<EmpleadoDetalle>(`/empleados/${id}`),
    create: (input: EmpleadoInput) => send<EmpleadoDetalle>('POST', '/empleados', nullIfEmpty(input)),
    reactivar: (id: number) => send<EmpleadoDetalle>('POST', `/empleados/${id}/reactivar`),
    update: (id: number, input: Partial<EmpleadoInput>) => send<EmpleadoDetalle>('PUT', `/empleados/${id}`, nullIfEmpty(input)),
    desactivar: (id: number, cancelarCitas = false) =>
      send<void>('DELETE', `/empleados/${id}`, undefined, { cancelar_citas: cancelarCitas }),
    horarios: (id: number, horarios: TramoHorario[]) => send<TramoHorario[]>('PUT', `/empleados/${id}/horarios`, { horarios }),
  },
  bloqueos: {
    list: (query: { desde: string; hasta: string; empleado_id?: number }) => get<Bloqueo[]>('/bloqueos', query),
    create: (input: { empleado_id: number | null; tipo: TipoBloqueo; fecha_inicio: string; fecha_fin: string; motivo: string }) =>
      send<Bloqueo>('POST', '/bloqueos', nullIfEmpty(input)),
    remove: (id: number) => send<void>('DELETE', `/bloqueos/${id}`),
  },
  citas: {
    list: (query: {
      desde?: string;
      hasta?: string;
      estado?: EstadoCita | '';
      cliente_id?: number;
      empleado_id?: number;
      q?: string;
      orden?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }) => paginated<Cita>('/citas', query),
    get: (id: number) => get<Cita>(`/citas/${id}`),
    create: (input: CitaInput) => send<Cita>('POST', '/citas', input),
    update: (id: number, input: Partial<Omit<CitaInput, 'cliente_id'>> & { version: number }) => send<Cita>('PATCH', `/citas/${id}`, input),
    cambiarEstado: (id: number, estado: 'confirmada' | 'completada' | 'no_asistio') =>
      send<Cita>('PATCH', `/citas/${id}/estado`, { estado }),
    completar: (id: number, notas: { servicio_id: number; notas: string }[]) =>
      send<Cita>('POST', `/citas/${id}/completar`, { notas_tecnicas: notas }),
    notasTecnicas: (id: number, notas: { servicio_id: number; notas: string }[]) =>
      send<Cita>('PUT', `/citas/${id}/notas-tecnicas`, { notas_tecnicas: notas }),
    cancelar: (id: number, motivo: string) => send<Cita>('POST', `/citas/${id}/cancelar`, { motivo }),
    recordatorio: (id: number) => send<Notificacion>('POST', `/citas/${id}/recordatorio`),
    disponibilidad: (query: { empleado_id: number; fecha: string; duracion: number; excluir_cita_id?: number }) =>
      get<{ fecha: string; huecos: string[] }>('/citas/disponibilidad', query),
  },
  productos: {
    list: (incluirInactivos = false) => get<Producto[]>('/productos', { incluir_inactivos: incluirInactivos }),
    create: (input: ProductoInput) => send<Producto>('POST', '/productos', nullIfEmpty(input)),
    update: (id: number, input: Partial<ProductoInput>) => send<Producto>('PUT', `/productos/${id}`, nullIfEmpty(input)),
  },
  cobros: {
    list: (query: { desde: string; hasta: string; incluir_anulados?: boolean }) => get<Cobro[]>('/cobros', query),
    create: (input: NuevoCobro) => send<Cobro>('POST', '/cobros', input),
    anular: (id: number, motivo: string) => send<Cobro>('POST', `/cobros/${id}/anular`, { motivo }),
    informe: (query: { desde: string; hasta: string }) => get<InformeCaja>('/informes/caja', query),
  },
  notificaciones: {
    list: (query: { cita_id?: number; cliente_id?: number; limit?: number }) => paginated<Notificacion>('/notificaciones', query),
    reintentar: (id: number) => send<Notificacion>('POST', `/notificaciones/${id}/reintentar`),
  },
} as const;
