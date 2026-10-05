/**
 * Caja: cobrar, consultar cobros, productos e informes.
 * ?cita=ID abre directamente el cobro de esa cita.
 */
import { useState } from 'react';
import { useUsuario } from '../../hooks/useSession';
import { cn } from '../../lib/cn';
import { tieneRol } from '../../lib/session';
import { AuthGate } from '../auth/AuthGate';
import { InformeCaja } from './InformeCaja';
import { ListaCobros } from './ListaCobros';
import { NuevoCobro } from './NuevoCobro';
import { Productos } from './Productos';

export function Caja() {
  return (
    <AuthGate roles={['admin', 'recepcion']}>
      <PanelCaja />
    </AuthGate>
  );
}

type Pestana = 'cobrar' | 'cobros' | 'productos' | 'informes';

function leerCita(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get('cita'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function PanelCaja() {
  const usuario = useUsuario();
  const esAdmin = tieneRol(usuario, 'admin');
  const [citaId] = useState(leerCita);
  const [pestana, setPestana] = useState<Pestana>('cobrar');
  const [ventaNueva, setVentaNueva] = useState(0); // fuerza un formulario limpio tras cobrar

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'cobrar', label: citaId ? 'Cobrar cita' : 'Nueva venta' },
    { id: 'cobros', label: 'Cobros' },
    { id: 'productos', label: 'Productos' },
    ...(esAdmin ? [{ id: 'informes' as const, label: 'Informes' }] : []),
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Caja" className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {pestanas.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
              pestana === p.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {pestana === 'cobrar' && (
          <NuevoCobro
            key={ventaNueva}
            citaId={citaId}
            onCobrado={() => {
              setVentaNueva((n) => n + 1);
              setPestana('cobros');
              if (citaId) window.history.replaceState(null, '', '/caja');
            }}
          />
        )}
        {pestana === 'cobros' && <ListaCobros puedeAnular={esAdmin} />}
        {pestana === 'productos' && <Productos editable={esAdmin} />}
        {pestana === 'informes' && esAdmin && <InformeCaja />}
      </div>
    </div>
  );
}
