import { useMemo } from 'react';
import { api } from '../lib/api';
import { diasDelMes, toDateKey } from '../lib/format';
import type { Bloqueo, Cita } from '../lib/types';
import { useAsync } from './useAsync';

export interface Agenda {
  porDia: ReadonlyMap<string, Cita[]>;
  bloqueos: Bloqueo[];
  /** Bloqueos que tocan un día concreto */
  bloqueosDelDia: (dia: string) => Bloqueo[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Citas y bloqueos de las 6 semanas visibles en el calendario del mes.
 * Cubre también la vista semanal del día seleccionado (siempre cae dentro).
 */
export function useAgenda(mes: Date): Agenda {
  const dias = diasDelMes(mes);
  const desde = toDateKey(dias[0]!);
  const hasta = toDateKey(dias[dias.length - 1]!);

  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.citas.list({ desde, hasta, limit: 500 }), api.bloqueos.list({ desde, hasta })]),
    [desde, hasta],
  );

  return useMemo(() => {
    const porDia = new Map<string, Cita[]>();
    for (const cita of data?.[0].items ?? []) {
      const key = toDateKey(new Date(cita.fecha_inicio));
      porDia.set(key, [...(porDia.get(key) ?? []), cita]);
    }
    const bloqueos = data?.[1] ?? [];
    const bloqueosDelDia = (dia: string) => {
      const inicio = new Date(`${dia}T00:00`);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
      return bloqueos.filter((b) => new Date(b.fecha_inicio) < fin && new Date(b.fecha_fin) > inicio);
    };
    return { porDia, bloqueos, bloqueosDelDia, loading, error, reload };
  }, [data, loading, error, reload]);
}

/** Huecos libres de un profesional para una fecha y duración */
export function useDisponibilidad(params: {
  empleadoId: number | null;
  fecha: string;
  duracion: number;
  excluirCitaId?: number | undefined;
}) {
  const { empleadoId, fecha, duracion, excluirCitaId } = params;
  const enabled = Boolean(empleadoId && fecha && duracion > 0);

  return useAsync(
    () =>
      api.citas
        .disponibilidad({ empleado_id: empleadoId ?? 0, fecha, duracion, ...(excluirCitaId ? { excluir_cita_id: excluirCitaId } : {}) })
        .then((r) => r.huecos),
    [empleadoId, fecha, duracion, excluirCitaId],
    { enabled },
  );
}
