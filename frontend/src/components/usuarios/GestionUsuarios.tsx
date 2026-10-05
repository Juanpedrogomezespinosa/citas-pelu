/**
 * Gestión de usuarios del panel (solo administración): alta con contraseña
 * temporal, cambio de rol, activar/desactivar y restablecer contraseña.
 */
import { useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { useUsuario } from '../../hooks/useSession';
import { api } from '../../lib/api';
import { formatFechaCorta, formatHora } from '../../lib/format';
import { ROL_LABEL, type Rol, type UsuarioAdmin, type UsuarioConPasswordTemporal } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input, Select } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { PageLoader } from '../ui/Spinner';
import { campo } from '../../lib/form';

export function GestionUsuarios() {
  return (
    <AuthGate roles={['admin']}>
      <Usuarios />
    </AuthGate>
  );
}

const ROLES: Rol[] = ['admin', 'recepcion', 'empleado'];

function Usuarios() {
  const yo = useUsuario();
  const { data, loading, error, reload } = useAsync(() => api.usuarios.list(), []);
  const [alta, setAlta] = useState(false);
  const [credenciales, setCredenciales] = useState<UsuarioConPasswordTemporal | null>(null);
  const [aRestablecer, setARestablecer] = useState<UsuarioAdmin | null>(null);

  const actualizar = useAction((id: number, cambios: Partial<{ rol: Rol; activo: boolean }>) => api.usuarios.update(id, cambios));
  const restablecer = useAction((id: number) => api.usuarios.restablecerPassword(id));

  const cambiar = async (u: UsuarioAdmin, cambios: Partial<{ rol: Rol; activo: boolean }>) => {
    if (await actualizar.run(u.id, cambios)) reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          Cada persona del salón con su propio acceso. Sin email: la contraseña inicial la genera el sistema.
        </p>
        <Button onClick={() => setAlta(true)}>Nuevo usuario</Button>
      </div>

      {(error ?? actualizar.error) && <Alert tone="error">{error ?? actualizar.error}</Alert>}

      <div className="card overflow-x-auto">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Usuarios del panel</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Rol
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Último acceso
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.map((u) => (
                <tr key={u.id} className={u.activo ? '' : 'text-stone-400'}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">
                      {u.nombre} {u.id === yo.id && <span className="text-xs font-normal text-stone-500">(tú)</span>}
                    </p>
                    <p className="text-xs text-stone-500">{u.email}</p>
                    {u.debe_cambiar_password && <p className="text-xs text-amber-700">Pendiente de cambiar la contraseña temporal</p>}
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`rol-${u.id}`}>
                      Rol de {u.nombre}
                    </label>
                    <Select
                      id={`rol-${u.id}`}
                      className="w-40"
                      value={u.rol}
                      disabled={u.id === yo.id || actualizar.pending}
                      onChange={(e) => void cambiar(u, { rol: e.target.value as Rol })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROL_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {u.ultimo_acceso ? `${formatFechaCorta(u.ultimo_acceso)} ${formatHora(u.ultimo_acceso)}` : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">{u.activo ? <span className="text-emerald-700">Activo</span> : 'Desactivado'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setARestablecer(u)} disabled={!u.activo}>
                        Restablecer contraseña
                      </Button>
                      {u.id !== yo.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cambiar(u, { activo: !u.activo })}
                          disabled={actualizar.pending}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NuevoUsuarioModal
        open={alta}
        onClose={() => setAlta(false)}
        onCreado={(r) => {
          setAlta(false);
          setCredenciales(r);
          reload();
        }}
      />

      <ConfirmDialog
        open={aRestablecer !== null}
        title="Restablecer contraseña"
        confirmLabel="Generar contraseña temporal"
        pending={restablecer.pending}
        error={restablecer.error}
        onCancel={() => setARestablecer(null)}
        onConfirm={() => {
          if (!aRestablecer) return;
          void restablecer.run(aRestablecer.id).then((r) => {
            if (!r) return;
            setARestablecer(null);
            setCredenciales(r);
            reload();
          });
        }}
      >
        <p>
          Se generará una contraseña temporal para <strong>{aRestablecer?.nombre}</strong> y se cerrarán todas sus sesiones. Deberá
          cambiarla al entrar.
        </p>
      </ConfirmDialog>

      <CredencialesModal datos={credenciales} onClose={() => setCredenciales(null)} />
    </div>
  );
}

function NuevoUsuarioModal({
  open,
  onClose,
  onCreado,
}: {
  open: boolean;
  onClose: () => void;
  onCreado: (r: UsuarioConPasswordTemporal) => void;
}) {
  const crear = useAction(api.usuarios.create);
  const [rol, setRol] = useState<Rol>('recepcion');

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const r = await crear.run({ nombre: campo(data, 'nombre'), email: campo(data, 'email'), rol });
    if (r) onCreado(r);
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>Nuevo usuario</Modal.Header>
      <form onSubmit={onSubmit} noValidate>
        <Modal.Body className="space-y-4">
          {crear.error && <Alert tone="error">{crear.error}</Alert>}
          <Field label="Nombre" error={crear.fieldErrors['nombre']} required>
            {(a) => <Input {...a} name="nombre" autoComplete="off" required />}
          </Field>
          <Field label="Email (usuario de acceso)" error={crear.fieldErrors['email']} required>
            {(a) => <Input {...a} name="email" type="email" autoComplete="off" required />}
          </Field>
          <Field label="Rol" hint="Estilista: ve la agenda y completa sus citas. Recepción: además reserva y cobra.">
            {(a) => (
              <Select {...a} value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROL_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={crear.pending}>
            Crear usuario
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

/** Muestra la contraseña temporal UNA vez para entregarla en persona */
function CredencialesModal({ datos, onClose }: { datos: UsuarioConPasswordTemporal | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const cerrar = () => {
    setCopiado(false);
    onClose();
  };
  return (
    <Modal open={datos !== null} onClose={cerrar} size="sm">
      <Modal.Header>Contraseña temporal</Modal.Header>
      <Modal.Body className="space-y-3 text-sm">
        <p>
          Entrega estos datos a <strong>{datos?.usuario.nombre}</strong>. La contraseña solo se muestra ahora y tendrá que cambiarla al
          entrar.
        </p>
        <dl className="space-y-2 rounded-lg bg-stone-50 p-3">
          <div>
            <dt className="text-xs text-stone-500">Usuario</dt>
            <dd className="font-medium">{datos?.usuario.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Contraseña temporal</dt>
            <dd className="font-mono text-lg tracking-wider">{datos?.password_temporal}</dd>
          </div>
        </dl>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={() => {
            if (!datos) return;
            void navigator.clipboard.writeText(datos.password_temporal).then(() => setCopiado(true));
          }}
        >
          {copiado ? 'Copiada' : 'Copiar contraseña'}
        </Button>
        <Button onClick={cerrar}>Hecho</Button>
      </Modal.Footer>
    </Modal>
  );
}
