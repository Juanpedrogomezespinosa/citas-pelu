/**
 * Gestión de clientes: listado con búsqueda y paginación + panel con la ficha
 * completa (editable) y el historial. ?nuevo=1 abre el alta; ?id=5 abre una ficha.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { nombreCompleto } from '../../lib/format';
import type { Cliente } from '../../lib/types';
import { useUsuario } from '../../hooks/useSession';
import { tieneRol } from '../../lib/session';
import { AuthGate } from '../auth/AuthGate';
import { AccionesCliente } from './AccionesCliente';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { PageLoader } from '../ui/Spinner';
import { ClientForm } from './ClientForm';
import { ClientHistory } from './ClientHistory';

export function ClientsManager() {
  return (
    <AuthGate>
      <Clientes />
    </AuthGate>
  );
}

type Panel = { modo: 'vacio' } | { modo: 'nuevo' } | { modo: 'ficha'; id: number };
type Pestana = 'perfil' | 'historial';

function panelDesdeUrl(): Panel {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id'));
  if (Number.isInteger(id) && id > 0) return { modo: 'ficha', id };
  return params.get('nuevo') ? { modo: 'nuevo' } : { modo: 'vacio' };
}

function Clientes() {
  const usuario = useUsuario();
  const [texto, setTexto] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(texto.trim());
  const [panel, setPanel] = useState<Panel>(panelDesdeUrl);

  useEffect(() => setPage(1), [q]);

  // Administración ve también a los clientes dados de baja (para reactivarlos)
  const lista = useAsync(
    () => api.clientes.list({ q, page, limit: 15, incluir_inactivos: usuario.rol === 'admin' }),
    [q, page, usuario.rol],
  );

  // Mantener la URL sincronizada: se puede compartir/recargar la ficha abierta
  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = panel.modo === 'ficha' ? `?id=${panel.id}` : panel.modo === 'nuevo' ? '?nuevo=1' : '';
    window.history.replaceState(null, '', url);
  }, [panel]);

  const { reload } = lista;
  const onSaved = useCallback(
    (c: Cliente) => {
      setPanel({ modo: 'ficha', id: c.id });
      reload();
    },
    [reload],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section aria-label="Listado de clientes" className="space-y-3">
        <div className="flex gap-2">
          <label htmlFor="buscar-cliente" className="sr-only">
            Buscar cliente
          </label>
          <input
            id="buscar-cliente"
            type="search"
            className="control"
            placeholder="Buscar por nombre, teléfono…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {tieneRol(usuario, 'admin', 'recepcion') && <Button onClick={() => setPanel({ modo: 'nuevo' })}>Nuevo</Button>}
        </div>

        {lista.error && <Alert tone="error">{lista.error}</Alert>}
        <div className="card overflow-hidden">
          {lista.loading && !lista.data ? (
            <PageLoader />
          ) : lista.data?.items.length ? (
            <ul className="divide-y divide-stone-100" aria-busy={lista.loading}>
              {lista.data.items.map((c) => {
                const seleccionado = panel.modo === 'ficha' && panel.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setPanel({ modo: 'ficha', id: c.id })}
                      aria-current={seleccionado || undefined}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none focus-visible:ring-inset',
                        seleccionado ? 'bg-brand-50' : 'hover:bg-stone-50',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-stone-900">{nombreCompleto(c)}</span>
                        <span className="block text-xs text-stone-500">{c.telefono}</span>
                      </span>
                      {c.sensibilidad_cuero_cabelludo === 'alta' && (
                        <span
                          className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                          title="Cuero cabelludo sensible"
                        >
                          Sensible
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-stone-500">{q ? 'Sin resultados.' : 'Todavía no hay clientes.'}</p>
          )}
        </div>

        {lista.data && lista.data.meta.totalPages > 1 && (
          <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-stone-600">
              {page} / {lista.data.meta.totalPages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= lista.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </nav>
        )}
      </section>

      <section aria-label="Ficha de cliente" className="card min-h-96 p-5 sm:p-6">
        {panel.modo === 'vacio' && (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <p className="font-medium text-stone-800">Selecciona un cliente</p>
            <p className="mt-1 text-sm text-stone-500">o crea uno nuevo para registrar su ficha y preferencias.</p>
          </div>
        )}
        {panel.modo === 'nuevo' && (
          <>
            <h2 className="mb-5 font-display text-xl font-semibold text-stone-900">Nuevo cliente</h2>
            <ClientForm cliente={null} onSaved={onSaved} onCancel={() => setPanel({ modo: 'vacio' })} />
          </>
        )}
        {panel.modo === 'ficha' && <FichaCliente key={panel.id} id={panel.id} onSaved={onSaved} />}
      </section>
    </div>
  );
}

function FichaCliente({ id, onSaved }: { id: number; onSaved: (c: Cliente) => void }) {
  const usuario = useUsuario();
  const [pestana, setPestana] = useState<Pestana>('perfil');
  const { data: cliente, loading, error, reload } = useAsync(() => api.clientes.get(id), [id]);
  const alGuardar = useCallback(
    (c: Cliente) => {
      reload(); // refresca la cabecera (nombre, teléfono) con lo guardado
      onSaved(c);
    },
    [reload, onSaved],
  );

  if (loading && !cliente) return <PageLoader />;
  if (error || !cliente) return <Alert tone="error">{error ?? 'Cliente no encontrado'}</Alert>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-900">{nombreCompleto(cliente)}</h2>
          <p className="text-sm text-stone-500">
            {cliente.telefono ?? 'Sin datos de contacto'}
            {!cliente.acepta_whatsapp && cliente.telefono && ' · sin WhatsApp'}
            {!cliente.activo && !cliente.anonimizado_en && ' · de baja'}
          </p>
        </div>
        {cliente.activo && tieneRol(usuario, 'admin', 'recepcion') && (
          <a
            href="/citas/nueva"
            className="inline-flex items-center rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Agendar cita
          </a>
        )}
      </div>
      {tieneRol(usuario, 'admin') && (
        <div className="mb-5">
          <AccionesCliente cliente={cliente} onCambio={() => alGuardar(cliente)} />
        </div>
      )}

      <div role="tablist" aria-label="Secciones de la ficha" className="mb-5 flex gap-1 border-b border-stone-200">
        {(['perfil', 'historial'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            type="button"
            id={`tab-${p}`}
            aria-selected={pestana === p}
            aria-controls={`panel-${p}`}
            onClick={() => setPestana(p)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
              pestana === p ? 'border-brand-700 text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
            )}
          >
            {p === 'perfil' ? 'Perfil y preferencias' : 'Historial de servicios'}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {pestana === 'perfil' ? (
          <ClientForm cliente={cliente} onSaved={alGuardar} editable={!cliente.anonimizado_en && tieneRol(usuario, 'admin', 'recepcion')} />
        ) : (
          <ClientHistory clienteId={cliente.id} />
        )}
      </div>
    </div>
  );
}
