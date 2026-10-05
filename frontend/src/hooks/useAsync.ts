import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '../lib/api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Carga datos asíncronos y se vuelve a ejecutar cuando cambian `deps`.
 * Ignora respuestas obsoletas: si el usuario cambia de filtro rápido, solo
 * se pinta el resultado de la última petición (evita condiciones de carrera).
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList, { enabled = true } = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [version, setVersion] = useState(0);
  // Siempre la última versión del loader, sin que sea dependencia del efecto
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let vigente = true;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then(
        (result) => {
          if (vigente) setData(result);
        },
        (err: unknown) => {
          if (vigente) setError(err instanceof ApiError ? err.message : 'Error inesperado');
        },
      )
      .finally(() => {
        if (vigente) setLoading(false);
      });

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, enabled]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
