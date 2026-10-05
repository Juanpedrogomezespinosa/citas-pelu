/**
 * Mi cuenta: cambio de contraseña (obligatorio en el primer acceso o tras un
 * restablecimiento) y cierre de sesión en todos los dispositivos.
 */
import { useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useUsuario } from '../../hooks/useSession';
import { api } from '../../lib/api';
import { guardarUsuario, olvidarUsuario } from '../../lib/session';
import { ROL_LABEL } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input } from '../ui/Field';
import { campo } from '../../lib/form';

export function MiCuenta() {
  return (
    <AuthGate>
      <Cuenta />
    </AuthGate>
  );
}

const REGLAS = [
  { test: (p: string) => p.length >= 10, texto: 'Al menos 10 caracteres' },
  { test: (p: string) => /[A-Z]/.test(p), texto: 'Una mayúscula' },
  { test: (p: string) => /[a-z]/.test(p), texto: 'Una minúscula' },
  { test: (p: string) => /\d/.test(p), texto: 'Un número' },
];

function Cuenta() {
  const usuario = useUsuario();
  const forzado = usuario.debe_cambiar_password;
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ok, setOk] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const cambiar = useAction(api.auth.cambiarPassword);
  const cerrarTodas = useAction(api.auth.cerrarTodas);

  const cumple = REGLAS.every((r) => r.test(nueva));
  const coincide = nueva === repetida;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const actual = campo(new FormData(event.currentTarget), 'actual');
    const actualizado = await cambiar.run(actual, nueva);
    if (!actualizado) return;
    guardarUsuario(actualizado);
    setOk(true);
    if (forzado) window.location.assign('/');
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="card p-6" aria-labelledby="titulo-password">
        <h2 id="titulo-password" className="font-display text-lg font-semibold text-stone-900">
          Cambiar contraseña
        </h2>
        {forzado && (
          <Alert tone="info" className="mt-3">
            Estás usando una contraseña temporal. Elige una nueva para continuar.
          </Alert>
        )}
        {ok && !forzado && (
          <Alert tone="success" className="mt-3">
            Contraseña actualizada. Las demás sesiones abiertas se han cerrado.
          </Alert>
        )}
        {cambiar.error && (
          <Alert tone="error" className="mt-3">
            {cambiar.error}
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <Field label={forzado ? 'Contraseña temporal' : 'Contraseña actual'} error={cambiar.fieldErrors['actual']} required>
            {(a) => <Input {...a} name="actual" type="password" autoComplete="current-password" required />}
          </Field>
          <Field label="Nueva contraseña" error={cambiar.fieldErrors['nueva']} required>
            {(a) => <Input {...a} type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />}
          </Field>
          <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Requisitos de la contraseña">
            {REGLAS.map((r) => (
              <li key={r.texto} className={r.test(nueva) ? 'text-emerald-700' : 'text-stone-500'}>
                {r.test(nueva) ? '✓' : '○'} {r.texto}
              </li>
            ))}
          </ul>
          <Field label="Repite la nueva contraseña" error={repetida && !coincide ? 'No coincide' : undefined} required>
            {(a) => (
              <Input {...a} type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
            )}
          </Field>
          <Button type="submit" loading={cambiar.pending} disabled={!cumple || !coincide}>
            Guardar contraseña
          </Button>
        </form>
      </section>

      <aside className="card h-fit space-y-4 p-6">
        <div>
          <p className="text-sm font-medium text-stone-900">{usuario.nombre}</p>
          <p className="text-sm text-stone-600">{usuario.email}</p>
          <p className="mt-1 text-xs text-stone-500">{ROL_LABEL[usuario.rol]}</p>
        </div>
        {!forzado && (
          <Button variant="secondary" className="w-full" onClick={() => setConfirmarCierre(true)}>
            Cerrar sesión en todos los dispositivos
          </Button>
        )}
      </aside>

      <ConfirmDialog
        open={confirmarCierre}
        title="Cerrar todas las sesiones"
        confirmLabel="Cerrar sesiones"
        tone="danger"
        pending={cerrarTodas.pending}
        error={cerrarTodas.error}
        onCancel={() => setConfirmarCierre(false)}
        onConfirm={() => {
          void cerrarTodas.run().then(() => {
            olvidarUsuario();
            window.location.assign('/login');
          });
        }}
      >
        <p>
          Se cerrará tu sesión en este y en cualquier otro dispositivo (útil si has perdido un móvil o has entrado en un ordenador
          compartido).
        </p>
      </ConfirmDialog>
    </div>
  );
}
