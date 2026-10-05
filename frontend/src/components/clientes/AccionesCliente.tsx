/**
 * Acciones de administración sobre un cliente: baja/reactivación y RGPD
 * (exportar todos sus datos y anonimizarlo de forma irreversible).
 */
import { useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { api } from '../../lib/api';
import type { Cliente } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { CitasAfectadas, citasDeError } from '../ui/CitasAfectadas';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input } from '../ui/Field';

type Dialogo = 'baja' | 'anonimizar' | null;

export function AccionesCliente({ cliente, onCambio }: { cliente: Cliente; onCambio: () => void }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [confirmacion, setConfirmacion] = useState('');

  const baja = useAction(async (cancelarCitas: boolean) => {
    await api.clientes.desactivar(cliente.id, cancelarCitas);
    return true as const;
  });
  const reactivar = useAction(() => api.clientes.reactivar(cliente.id));
  const anonimizar = useAction(() => api.clientes.anonimizar(cliente.id));
  const exportar = useAction(() => api.clientes.exportar(cliente.id));

  const cerrar = () => {
    setDialogo(null);
    setConfirmacion('');
    baja.reset();
    anonimizar.reset();
  };

  /** Descarga un JSON con todos los datos del cliente (derecho de acceso y portabilidad) */
  async function descargar() {
    const datos = await exportar.run();
    if (!datos) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    const enlace = Object.assign(document.createElement('a'), { href: url, download: `cliente-${cliente.id}-datos.json` });
    enlace.click();
    URL.revokeObjectURL(url);
  }

  if (cliente.anonimizado_en) return <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">Anonimizado (RGPD)</span>;

  const citasBaja = citasDeError(baja.errorDetails);
  const citasAnonimizar = citasDeError(anonimizar.errorDetails);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" loading={exportar.pending} onClick={() => void descargar()}>
        Exportar datos
      </Button>
      {cliente.activo ? (
        <Button size="sm" variant="ghost" onClick={() => setDialogo('baja')}>
          Dar de baja
        </Button>
      ) : (
        <Button size="sm" variant="ghost" loading={reactivar.pending} onClick={() => void reactivar.run().then(onCambio)}>
          Reactivar
        </Button>
      )}
      <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setDialogo('anonimizar')}>
        Anonimizar
      </Button>
      {(exportar.error ?? reactivar.error) && <Alert tone="error">{exportar.error ?? reactivar.error}</Alert>}

      <ConfirmDialog
        open={dialogo === 'baja'}
        title="Dar de baja al cliente"
        confirmLabel={citasBaja.length ? `Cancelar ${citasBaja.length} cita(s) y dar de baja` : 'Dar de baja'}
        tone="danger"
        pending={baja.pending}
        error={baja.error}
        onCancel={cerrar}
        onConfirm={() =>
          void baja.run(citasBaja.length > 0).then((ok) => {
            if (!ok) return;
            cerrar();
            onCambio();
          })
        }
      >
        <p>No aparecerá en las búsquedas ni podrá reservar. Su historial se conserva y se puede reactivar.</p>
        {citasBaja.length > 0 && (
          <>
            <CitasAfectadas citas={citasBaja} />
            <p>Si continúas, estas citas se cancelarán y se avisará al cliente por WhatsApp.</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialogo === 'anonimizar'}
        title="Anonimizar cliente (RGPD)"
        confirmLabel="Anonimizar definitivamente"
        tone="danger"
        pending={anonimizar.pending}
        error={anonimizar.error}
        onCancel={cerrar}
        onConfirm={() => {
          if (confirmacion !== 'ANONIMIZAR') return;
          void anonimizar.run().then((r) => {
            if (!r) return;
            cerrar();
            onCambio();
          });
        }}
      >
        <p>
          Se borrarán <strong>de forma irreversible</strong> el nombre, teléfono, email, preferencias, notas, fichas técnicas y mensajes de
          WhatsApp de este cliente. Las citas y cobros se conservan sin datos personales (obligación contable).
        </p>
        <p>Antes de hacerlo, puedes exportar sus datos si los ha solicitado.</p>
        {citasAnonimizar.length > 0 && <CitasAfectadas citas={citasAnonimizar} />}
        <Field label='Escribe "ANONIMIZAR" para confirmar'>
          {(a) => <Input {...a} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="off" />}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
