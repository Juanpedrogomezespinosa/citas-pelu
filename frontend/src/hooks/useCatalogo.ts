import { useMemo } from 'react';
import { api } from '../lib/api';
import type { Empleado, Servicio } from '../lib/types';
import { useAsync } from './useAsync';

export interface Catalogo {
  empleados: Empleado[];
  servicios: Servicio[];
  loading: boolean;
  error: string | null;
}

/** Empleados y servicios activos (datos maestros para los formularios) */
export function useCatalogo(): Catalogo {
  const { data, loading, error } = useAsync(() => Promise.all([api.empleados.list(), api.servicios.list()]), []);
  return useMemo(() => ({ empleados: data?.[0] ?? [], servicios: data?.[1] ?? [], loading, error }), [data, loading, error]);
}
