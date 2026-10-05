/**
 * Formulario de acceso.
 *
 * Inputs NO controlados leídos con FormData: el HTML de Astro es interactivo
 * antes de que React hidrate la isla, y con inputs controlados lo que el
 * usuario escribiera en ese intervalo se perdería al hidratar.
 */
import { useEffect, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { api } from '../../lib/api';
import { guardarUsuario } from '../../lib/session';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { campo } from '../../lib/form';

export function LoginForm() {
  const login = useAction(api.auth.login);

  // Si la cookie de sesión sigue siendo válida, directo al panel
  useEffect(() => {
    api.auth.me().then(
      () => window.location.replace('/'),
      () => undefined,
    );
  }, []);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const usuario = await login.run(campo(data, 'email').trim(), campo(data, 'password'));
    if (usuario) {
      guardarUsuario(usuario);
      window.location.assign(usuario.debe_cambiar_password ? '/cuenta?forzado=1' : '/');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {login.error && <Alert tone="error">{login.error}</Alert>}
      <Field label="Email" error={login.fieldErrors['email']} required>
        {(a11y) => <Input {...a11y} name="email" type="email" autoComplete="username" required autoFocus />}
      </Field>
      <Field label="Contraseña" error={login.fieldErrors['password']} required>
        {(a11y) => <Input {...a11y} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" className="w-full" loading={login.pending}>
        Entrar
      </Button>
      <p className="text-center text-xs text-stone-500">¿Has olvidado la contraseña? Pide a administración que te la restablezca.</p>
    </form>
  );
}
