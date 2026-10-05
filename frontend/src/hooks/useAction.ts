import { useCallback, useState } from 'react';
import { ApiError } from '../lib/api';

export interface ActionState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  error: string | null;
  /** Código de error de la API (p. ej. 'HAS_FUTURE_APPOINTMENTS') */
  errorCode: string | null;
  fieldErrors: Record<string, string>;
  /** Detalles adicionales del error (p. ej. las citas que impiden la operación) */
  errorDetails: Record<string, unknown>;
  reset: () => void;
}

/**
 * Envuelve una mutación (crear, cancelar...) con estado de carga y errores.
 * Devuelve undefined si falla, para que el componente no tenga que usar try/catch.
 */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>): ActionState<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown>>({});

  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      setErrorCode(null);
      setFieldErrors({});
      setErrorDetails({});
      try {
        return await action(...args);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
          setErrorCode(err.code);
          setFieldErrors(err.fields);
          setErrorDetails(err.details);
        } else {
          setError('Error inesperado');
        }
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
    setErrorDetails({});
  }, []);

  return { run, pending, error, errorCode, fieldErrors, errorDetails, reset };
}
