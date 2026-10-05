/**
 * Estado y orquestación del formulario de reserva / reprogramación.
 * El componente solo pinta; aquí viven la carga, la validación, la
 * disponibilidad y el guardado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { toDateKey, toTimeKey, todayKey } from '../lib/format';
import type { Cita, FieldErrors } from '../lib/types';
import { hayErrores, validarCita, type CitaDraft } from '../lib/validation';
import { useAction } from './useAction';
import { useAsync } from './useAsync';
import { useCatalogo } from './useCatalogo';
import { useDisponibilidad } from './useAgenda';

export interface ClienteSeleccionado {
  id: number;
  nombre: string;
  telefono: string;
}

const VACIO: CitaDraft = { cliente_id: null, empleado_id: null, servicios: [], fecha: todayKey(), hora: '', notas: '' };

export function useCitaForm(citaId: number | null) {
  const catalogo = useCatalogo();
  const [draft, setDraft] = useState<CitaDraft>(VACIO);
  const [cliente, setCliente] = useState<ClienteSeleccionado | null>(null);
  const [errors, setErrors] = useState<FieldErrors<CitaDraft>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [guardada, setGuardada] = useState<Cita | null>(null);

  // Modo edición: cargar la cita y rellenar el formulario
  const original = useAsync(() => api.citas.get(citaId ?? 0), [citaId], { enabled: citaId !== null });
  useEffect(() => {
    const c = original.data;
    if (!c) return;
    setCliente({ id: c.cliente_id, nombre: c.cliente_nombre, telefono: c.cliente_telefono ?? '' });
    setDraft({
      cliente_id: c.cliente_id,
      empleado_id: c.empleado_id,
      servicios: c.servicios.map((s) => s.servicio_id),
      fecha: toDateKey(new Date(c.fecha_inicio)),
      hora: toTimeKey(c.fecha_inicio),
      notas: c.notas ?? '',
    });
  }, [original.data]);

  const seleccionados = useMemo(
    () => catalogo.servicios.filter((s) => draft.servicios.includes(s.id)),
    [catalogo.servicios, draft.servicios],
  );
  const duracion = seleccionados.reduce((t, s) => t + s.duracion_minutos, 0);
  const total = seleccionados.reduce((t, s) => t + s.precio, 0);

  const huecos = useDisponibilidad({
    empleadoId: draft.empleado_id,
    fecha: draft.fecha,
    duracion,
    excluirCitaId: citaId ?? undefined,
  });

  // Si cambia el profesional, el día o la duración y la hora elegida deja de
  // estar libre, se deselecciona (nunca se envía una hora no disponible)
  useEffect(() => {
    if (huecos.loading || !huecos.data || !draft.hora) return;
    if (!huecos.data.includes(draft.hora)) setDraft((d) => ({ ...d, hora: '' }));
  }, [huecos.data, huecos.loading, draft.hora]);

  const set = useCallback(<K extends keyof CitaDraft>(campo: K, valor: CitaDraft[K]) => {
    setDraft((d) => ({ ...d, [campo]: valor }));
    setErrors((e) => ({ ...e, [campo]: undefined }));
  }, []);

  const toggleServicio = useCallback(
    (id: number) => set('servicios', draft.servicios.includes(id) ? draft.servicios.filter((s) => s !== id) : [...draft.servicios, id]),
    [draft.servicios, set],
  );

  const elegirCliente = useCallback(
    (c: ClienteSeleccionado | null) => {
      setCliente(c);
      set('cliente_id', c?.id ?? null);
    },
    [set],
  );

  /** Paso 1: validar en cliente y abrir el resumen de confirmación */
  const revisar = useCallback(() => {
    const errs = validarCita(draft);
    setErrors(errs);
    if (!hayErrores(errs)) setConfirmando(true);
  }, [draft]);

  /** Paso 2: guardar en la API */
  const guardar = useAction(async () => {
    const fecha_inicio = `${draft.fecha}T${draft.hora}`;
    const base = { empleado_id: draft.empleado_id ?? 0, fecha_inicio, servicios: draft.servicios, notas: draft.notas };
    return original.data
      ? api.citas.update(original.data.id, { ...base, version: original.data.version })
      : api.citas.create({ ...base, cliente_id: draft.cliente_id ?? 0 });
  });

  // Errores por campo devueltos por el backend -> junto a cada input
  useEffect(() => {
    if (Object.keys(guardar.fieldErrors).length) setErrors((e) => ({ ...e, ...(guardar.fieldErrors as FieldErrors<CitaDraft>) }));
  }, [guardar.fieldErrors]);

  const { reload: recargarHuecos } = huecos;
  const confirmar = useCallback(async () => {
    const cita = await guardar.run();
    if (cita) {
      setConfirmando(false);
      setGuardada(cita);
    } else {
      recargarHuecos(); // p. ej. SLOT_UNAVAILABLE: alguien reservó ese hueco entre medias
    }
  }, [guardar, recargarHuecos]);

  const reiniciar = useCallback(() => {
    setDraft(VACIO);
    setCliente(null);
    setErrors({});
    setGuardada(null);
  }, []);

  return {
    catalogo,
    original,
    draft,
    cliente,
    errors,
    seleccionados,
    duracion,
    total,
    huecos,
    set,
    toggleServicio,
    elegirCliente,
    revisar,
    confirmando,
    cerrarConfirmacion: () => setConfirmando(false),
    confirmar,
    guardando: guardar.pending,
    errorGuardar: guardar.error,
    guardada,
    reiniciar,
  };
}
