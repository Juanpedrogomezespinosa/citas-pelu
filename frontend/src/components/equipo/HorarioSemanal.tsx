/**
 * Editor del horario semanal de un profesional: varios tramos por día
 * (p. ej. mañana y tarde). Sin ningún tramo, trabaja el horario del salón.
 */
import { useEffect, useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { api } from '../../lib/api';
import type { TramoHorario } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

interface HorarioSemanalProps {
  empleadoId: number;
  inicial: TramoHorario[];
  editable: boolean;
  onSaved: () => void;
}

/** Orden de visualización lunes -> domingo (dia_semana: 0 = domingo) */
const DIAS = [
  { dia: 1, nombre: 'Lunes' },
  { dia: 2, nombre: 'Martes' },
  { dia: 3, nombre: 'Miércoles' },
  { dia: 4, nombre: 'Jueves' },
  { dia: 5, nombre: 'Viernes' },
  { dia: 6, nombre: 'Sábado' },
  { dia: 0, nombre: 'Domingo' },
] as const;

const solapan = (tramos: TramoHorario[]) =>
  DIAS.some(({ dia }) => {
    const delDia = tramos.filter((t) => t.dia_semana === dia).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return delDia.some((t, i) => i > 0 && t.hora_inicio < delDia[i - 1]!.hora_fin);
  });

export function HorarioSemanal({ empleadoId, inicial, editable, onSaved }: HorarioSemanalProps) {
  const [tramos, setTramos] = useState<TramoHorario[]>(inicial);
  const [guardado, setGuardado] = useState(false);
  const guardar = useAction((t: TramoHorario[]) => api.empleados.horarios(empleadoId, t));

  useEffect(() => setTramos(inicial), [inicial]);

  const actualizar = (indice: number, cambio: Partial<TramoHorario>) => {
    setGuardado(false);
    setTramos((ts) => ts.map((t, i) => (i === indice ? { ...t, ...cambio } : t)));
  };
  const invalido = tramos.some((t) => t.hora_fin <= t.hora_inicio) || solapan(tramos);

  return (
    <div className="space-y-4">
      {tramos.length === 0 && (
        <Alert tone="info">Sin horario propio: puede recibir citas en todo el horario del salón, todos los días.</Alert>
      )}
      {guardado && <Alert tone="success">Horario guardado.</Alert>}
      {guardar.error && <Alert tone="error">{guardar.error}</Alert>}

      <ul className="divide-y divide-stone-100">
        {DIAS.map(({ dia, nombre }) => {
          const delDia = tramos.map((t, i) => ({ t, i })).filter(({ t }) => t.dia_semana === dia);
          return (
            <li key={dia} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <span className="w-28 pt-2 text-sm font-medium text-stone-800">{nombre}</span>
              <div className="flex flex-1 flex-col gap-2">
                {delDia.length === 0 && <span className="pt-2 text-sm text-stone-400">{tramos.length ? 'Libre' : '—'}</span>}
                {delDia.map(({ t, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${nombre}: entrada`}
                      className="control w-32"
                      value={t.hora_inicio}
                      disabled={!editable}
                      step={900}
                      onChange={(e) => actualizar(i, { hora_inicio: e.target.value })}
                    />
                    <span className="text-stone-500">a</span>
                    <input
                      type="time"
                      aria-label={`${nombre}: salida`}
                      className="control w-32"
                      value={t.hora_fin}
                      disabled={!editable}
                      step={900}
                      aria-invalid={t.hora_fin <= t.hora_inicio || undefined}
                      onChange={(e) => actualizar(i, { hora_fin: e.target.value })}
                    />
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Quitar tramo del ${nombre}`}
                        onClick={() => setTramos((ts) => ts.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <button
                    type="button"
                    className="self-start text-xs font-medium text-brand-700 hover:underline"
                    onClick={() => {
                      const ultimo = delDia.at(-1)?.t;
                      setTramos((ts) => [
                        ...ts,
                        { dia_semana: dia, hora_inicio: ultimo ? '16:00' : '09:30', hora_fin: ultimo ? '20:00' : '14:00' },
                      ]);
                    }}
                  >
                    + Añadir tramo
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {invalido && <span className="text-xs text-red-700">Revisa los tramos: hay horas invertidas o solapadas.</span>}
          <Button
            loading={guardar.pending}
            disabled={invalido}
            onClick={() =>
              void guardar.run(tramos).then((r) => {
                if (!r) return;
                setGuardado(true);
                onSaved();
              })
            }
          >
            Guardar horario
          </Button>
        </div>
      )}
    </div>
  );
}
