/**
 * Ficha completa del cliente: datos de contacto, consentimiento de WhatsApp,
 * ficha técnica capilar (tipo de cabello, color, corte, sensibilidad,
 * alergias) y notas de preferencias.
 */
import type { SubmitEvent, ReactNode } from 'react';
import { useClienteForm } from '../../hooks/useClienteForm';
import { SENSIBILIDADES, TIPOS_CABELLO, type Cliente } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';

interface ClientFormProps {
  cliente: Cliente | null;
  onSaved: (cliente: Cliente) => void;
  onCancel?: () => void;
  /** false: solo lectura (estilistas o clientes anonimizados) */
  editable?: boolean;
}

const SENSIBILIDAD_LABEL = { ninguna: 'Ninguna', baja: 'Baja', media: 'Media', alta: 'Alta' } as const;

export function ClientForm({ cliente, onSaved, onCancel, editable = true }: ClientFormProps) {
  const { values, errors, set, submit, pending, error, guardadoOk } = useClienteForm(cliente, onSaved);

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {guardadoOk && <Alert tone="success">Ficha guardada correctamente.</Alert>}

      {/* Un <fieldset disabled> desactiva de una vez todos los controles en modo lectura */}
      <fieldset disabled={!editable} className="min-w-0 space-y-6">
        <Seccion titulo="Datos personales">
          <Field label="Nombre" error={errors.nombre} required>
            {(a) => (
              <Input {...a} autoComplete="off" value={values.nombre} onChange={(e) => set('nombre', e.target.value)} maxLength={80} />
            )}
          </Field>
          <Field label="Apellidos" error={errors.apellidos}>
            {(a) => (
              <Input
                {...a}
                autoComplete="off"
                value={values.apellidos}
                onChange={(e) => set('apellidos', e.target.value)}
                maxLength={120}
              />
            )}
          </Field>
          <Field label="Teléfono (WhatsApp)" error={errors.telefono} hint="Con o sin prefijo: 600 11 22 33" required>
            {(a) => (
              <Input {...a} type="tel" autoComplete="off" value={values.telefono} onChange={(e) => set('telefono', e.target.value)} />
            )}
          </Field>
          <Field label="Email" error={errors.email}>
            {(a) => <Input {...a} type="email" autoComplete="off" value={values.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Fecha de nacimiento" error={errors.fecha_nacimiento}>
            {(a) => <Input {...a} type="date" value={values.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} />}
          </Field>
          <label className="flex items-start gap-3 self-end rounded-lg border border-stone-200 p-3 text-sm">
            <input
              type="checkbox"
              checked={values.acepta_whatsapp}
              onChange={(e) => set('acepta_whatsapp', e.target.checked)}
              className="mt-0.5 size-4 accent-brand-700"
            />
            <span>
              <span className="block font-medium text-stone-900">Acepta recibir WhatsApp</span>
              <span className="text-xs text-stone-500">Confirmaciones y recordatorios de citas (consentimiento RGPD).</span>
            </span>
          </label>
        </Seccion>

        <Seccion titulo="Ficha técnica y preferencias">
          <Field label="Tipo de cabello" error={errors.tipo_cabello}>
            {(a) => (
              <Select
                {...a}
                value={values.tipo_cabello}
                onChange={(e) => set('tipo_cabello', e.target.value as typeof values.tipo_cabello)}
              >
                <option value="">Sin especificar</option>
                {TIPOS_CABELLO.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sensibilidad del cuero cabelludo" error={errors.sensibilidad_cuero_cabelludo}>
            {(a) => (
              <Select
                {...a}
                value={values.sensibilidad_cuero_cabelludo}
                onChange={(e) => set('sensibilidad_cuero_cabelludo', e.target.value as typeof values.sensibilidad_cuero_cabelludo)}
              >
                {SENSIBILIDADES.map((s) => (
                  <option key={s} value={s}>
                    {SENSIBILIDAD_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Color preferido" hint="Ej.: castaño chocolate 5.35" error={errors.color_preferido}>
            {(a) => (
              <Input {...a} value={values.color_preferido} onChange={(e) => set('color_preferido', e.target.value)} maxLength={100} />
            )}
          </Field>
          <Field label="Tipo de corte preferido" error={errors.tipo_corte_preferido}>
            {(a) => (
              <Input
                {...a}
                value={values.tipo_corte_preferido}
                onChange={(e) => set('tipo_corte_preferido', e.target.value)}
                maxLength={120}
              />
            )}
          </Field>
          <Field label="Alergias o contraindicaciones" error={errors.alergias} className="sm:col-span-2">
            {(a) => <Textarea {...a} value={values.alergias} onChange={(e) => set('alergias', e.target.value)} maxLength={500} />}
          </Field>
          <Field label="Productos preferidos" error={errors.productos_preferidos} className="sm:col-span-2">
            {(a) => (
              <Input
                {...a}
                value={values.productos_preferidos}
                onChange={(e) => set('productos_preferidos', e.target.value)}
                maxLength={500}
              />
            )}
          </Field>
        </Seccion>

        <Seccion titulo="Notas">
          <Field
            label="Notas y preferencias personales"
            hint="Horarios preferidos, gustos, observaciones…"
            error={errors.notas}
            className="sm:col-span-2"
          >
            {(a) => <Textarea {...a} rows={4} value={values.notas} onChange={(e) => set('notas', e.target.value)} maxLength={2000} />}
          </Field>
        </Seccion>
      </fieldset>

      {editable && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={pending}>
            {cliente ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      )}
    </form>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-semibold tracking-wide text-brand-800 uppercase">{titulo}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
