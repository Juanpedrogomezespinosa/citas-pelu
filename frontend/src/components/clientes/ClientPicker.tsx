/**
 * Buscador de clientes con autocompletado (patrón combobox ARIA):
 * flechas para moverse, Enter para elegir, Escape para cerrar.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import type { ClienteSeleccionado } from '../../hooks/useCitaForm';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { nombreCompleto } from '../../lib/format';
import { Spinner } from '../ui/Spinner';

interface ClientPickerProps {
  value: ClienteSeleccionado | null;
  onChange: (cliente: ClienteSeleccionado | null) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function ClientPicker({ value, onChange, error, disabled = false }: ClientPickerProps) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const q = useDebounce(texto.trim(), 250);
  const listId = useId();
  const inputId = useId();

  const { data, loading } = useAsync(() => api.clientes.list({ q, limit: 8 }), [q], { enabled: q.length >= 2 });
  const opciones = q.length >= 2 ? (data?.items ?? []) : [];

  function elegir(index: number) {
    const c = opciones[index];
    if (!c) return;
    onChange({ id: c.id, nombre: nombreCompleto(c), telefono: c.telefono ?? '' });
    setTexto('');
    setAbierto(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, opciones.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && abierto && opciones.length) {
      event.preventDefault();
      elegir(activo);
    } else if (event.key === 'Escape') {
      setAbierto(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-stone-900">{value.nombre}</p>
          <p className="text-xs text-stone-600">{value.telefono}</p>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-brand-700 hover:underline">
            Cambiar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Buscar cliente
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={abierto && opciones.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={abierto && opciones[activo] ? `${listId}-${activo}` : undefined}
        aria-invalid={error ? true : undefined}
        placeholder="Busca por nombre, teléfono o email…"
        className="control"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={onKeyDown}
      />
      {loading && q.length >= 2 && <Spinner className="absolute top-2.5 right-3 size-4 text-stone-400" />}

      {abierto && q.length >= 2 && !loading && (
        <ul id={listId} role="listbox" className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto py-1">
          {opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-stone-500">
              Sin resultados.{' '}
              <a href="/clientes?nuevo=1" className="font-medium text-brand-700 hover:underline">
                Crear cliente
              </a>
            </li>
          ) : (
            opciones.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(i)}
                onMouseEnter={() => setActivo(i)}
                className={cn('cursor-pointer px-3 py-2 text-sm', i === activo && 'bg-brand-50')}
              >
                <span className="font-medium text-stone-900">{nombreCompleto(c)}</span>
                <span className="ml-2 text-stone-500">{c.telefono}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
