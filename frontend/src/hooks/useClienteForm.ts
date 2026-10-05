import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Cliente, ClienteInput, FieldErrors } from '../lib/types';
import { hayErrores, validarCliente } from '../lib/validation';
import { useAction } from './useAction';

const VACIO: ClienteInput = {
  nombre: '',
  apellidos: '',
  telefono: '',
  email: '',
  fecha_nacimiento: '',
  acepta_whatsapp: true,
  tipo_cabello: '',
  color_preferido: '',
  tipo_corte_preferido: '',
  sensibilidad_cuero_cabelludo: 'ninguna',
  alergias: '',
  productos_preferidos: '',
  notas: '',
};

/** null de la API -> '' en el formulario (inputs controlados) */
function aFormulario(c: Cliente): ClienteInput {
  return {
    nombre: c.nombre,
    apellidos: c.apellidos ?? '',
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    fecha_nacimiento: c.fecha_nacimiento ?? '',
    acepta_whatsapp: c.acepta_whatsapp,
    tipo_cabello: c.tipo_cabello ?? '',
    color_preferido: c.color_preferido ?? '',
    tipo_corte_preferido: c.tipo_corte_preferido ?? '',
    sensibilidad_cuero_cabelludo: c.sensibilidad_cuero_cabelludo,
    alergias: c.alergias ?? '',
    productos_preferidos: c.productos_preferidos ?? '',
    notas: c.notas ?? '',
  };
}

/** Estado del formulario de ficha de cliente (alta y edición) */
export function useClienteForm(cliente: Cliente | null, onSaved: (c: Cliente) => void) {
  const [values, setValues] = useState<ClienteInput>(() => (cliente ? aFormulario(cliente) : VACIO));
  const [errors, setErrors] = useState<FieldErrors<ClienteInput>>({});
  const [guardadoOk, setGuardadoOk] = useState(false);

  // Solo se reinicia al cambiar de cliente (no cuando se recarga el mismo)
  const clienteId = cliente?.id ?? null;
  useEffect(() => {
    setValues(cliente ? aFormulario(cliente) : VACIO);
    setErrors({});
    setGuardadoOk(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const guardar = useAction((input: ClienteInput) => (clienteId ? api.clientes.update(clienteId, input) : api.clientes.create(input)));

  useEffect(() => {
    if (Object.keys(guardar.fieldErrors).length) setErrors(guardar.fieldErrors);
  }, [guardar.fieldErrors]);

  const set = useCallback(<K extends keyof ClienteInput>(campo: K, valor: ClienteInput[K]) => {
    setValues((v) => ({ ...v, [campo]: valor }));
    setErrors((e) => ({ ...e, [campo]: undefined }));
    setGuardadoOk(false);
  }, []);

  const submit = useCallback(async () => {
    const errs = validarCliente(values);
    setErrors(errs);
    if (hayErrores(errs)) return;
    const saved = await guardar.run(values);
    if (saved) {
      setValues(aFormulario(saved)); // muestra lo normalizado por el servidor (p. ej. teléfono E.164)
      setGuardadoOk(true);
      onSaved(saved);
    }
  }, [values, guardar, onSaved]);

  return { values, errors, set, submit, pending: guardar.pending, error: guardar.error, guardadoOk };
}
