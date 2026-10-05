/**
 * Textos de los mensajes de WhatsApp e interpretación de respuestas.
 * Funciones puras: fáciles de ajustar al tono del salón y de testear.
 */
import type { CitaDetalle } from '../../models/cita.model.js';
import type { RespuestaInterpretada } from '../../models/notificacion.model.js';
import { formatForMessage } from '../../utils/dates.js';
import type { PlantillaWhatsApp } from './whatsapp.provider.js';

export interface ContextoMensaje {
  readonly negocio: string;
  readonly timeZone: string;
}

type DatosCita = Pick<CitaDetalle, 'cliente_nombre' | 'empleado_nombre' | 'fecha_inicio' | 'servicios'>;

const primerNombre = (nombreCompleto: string): string => nombreCompleto.split(' ')[0] ?? nombreCompleto;
const listaServicios = (cita: DatosCita): string => cita.servicios.map((s) => s.nombre).join(', ');
const INSTRUCCIONES = 'Responde *SI* para confirmar tu asistencia o *NO* si necesitas cancelarla.';

/** Mensaje que inicia el negocio: texto libre + parámetros de su plantilla aprobada */
export interface MensajeConPlantilla {
  readonly texto: string;
  readonly plantilla: PlantillaWhatsApp;
}

/*
 * Los textos libres reproducen EXACTAMENTE las plantillas de
 * docs/whatsapp-plantillas.md: así el cliente recibe lo mismo tanto si el
 * mensaje sale como plantilla aprobada como si sale como texto libre (sandbox,
 * desarrollo o dentro de la ventana de 24 h). Si cambias un texto aquí,
 * cambia la plantilla y vuelve a enviarla a aprobación.
 */
function conPlantilla(clave: PlantillaWhatsApp['clave'], parametros: string[], texto: string): MensajeConPlantilla {
  return { texto, plantilla: { clave, parametros } };
}

export const Mensajes = {
  /** Plantilla "confirmacion": {{1}} nombre, {{2}} fecha, {{3}} servicios, {{4}} profesional */
  confirmacionCita(cita: DatosCita, ctx: ContextoMensaje): MensajeConPlantilla {
    const [nombre, fecha, servicios, profesional] = [
      primerNombre(cita.cliente_nombre),
      formatForMessage(cita.fecha_inicio, ctx.timeZone),
      listaServicios(cita),
      cita.empleado_nombre,
    ];
    return conPlantilla(
      'confirmacion',
      [nombre, fecha, servicios, profesional],
      [
        `Hola ${nombre} 👋, tu cita en *${ctx.negocio}* ha quedado reservada:`,
        '',
        `📅 ${fecha}`,
        `✂️ ${servicios}`,
        `💇 Con ${profesional}`,
        '',
        INSTRUCCIONES,
      ].join('\n'),
    );
  },

  /** Plantilla "recordatorio": {{1}} nombre, {{2}} fecha, {{3}} servicios */
  recordatorio(cita: DatosCita, ctx: ContextoMensaje): MensajeConPlantilla {
    const [nombre, fecha, servicios] = [
      primerNombre(cita.cliente_nombre),
      formatForMessage(cita.fecha_inicio, ctx.timeZone),
      listaServicios(cita),
    ];
    return conPlantilla(
      'recordatorio',
      [nombre, fecha, servicios],
      [`Hola ${nombre}, te recordamos tu cita en *${ctx.negocio}*:`, '', `📅 ${fecha}`, `✂️ ${servicios}`, '', INSTRUCCIONES].join('\n'),
    );
  },

  /** Plantilla "cambio": {{1}} nombre, {{2}} fecha, {{3}} servicios, {{4}} profesional */
  cambioCita(cita: DatosCita, ctx: ContextoMensaje): MensajeConPlantilla {
    const [nombre, fecha, servicios, profesional] = [
      primerNombre(cita.cliente_nombre),
      formatForMessage(cita.fecha_inicio, ctx.timeZone),
      listaServicios(cita),
      cita.empleado_nombre,
    ];
    return conPlantilla(
      'cambio',
      [nombre, fecha, servicios, profesional],
      [
        `Hola ${nombre}, tu cita en *${ctx.negocio}* ha cambiado. Nuevos datos:`,
        '',
        `📅 ${fecha}`,
        `✂️ ${servicios}`,
        `💇 Con ${profesional}`,
        '',
        INSTRUCCIONES,
      ].join('\n'),
    );
  },

  /** Plantilla "cancelacion": {{1}} nombre, {{2}} fecha */
  cancelacion(cita: DatosCita, ctx: ContextoMensaje): MensajeConPlantilla {
    const [nombre, fecha] = [primerNombre(cita.cliente_nombre), formatForMessage(cita.fecha_inicio, ctx.timeZone)];
    return conPlantilla(
      'cancelacion',
      [nombre, fecha],
      `Hola ${nombre}, tu cita del ${fecha} en *${ctx.negocio}* ha sido cancelada. Si quieres una nueva cita, escríbenos o llámanos.`,
    );
  },

  // Respuestas automáticas: van dentro de la ventana de 24 h abierta por el
  // propio cliente, así que no necesitan plantilla.
  respuestaConfirmada: (cita: DatosCita, ctx: ContextoMensaje) =>
    `¡Gracias! ✅ Tu cita del ${formatForMessage(cita.fecha_inicio, ctx.timeZone)} queda confirmada. ¡Te esperamos!`,

  respuestaCancelada: (cita: DatosCita, ctx: ContextoMensaje) =>
    `Hemos cancelado tu cita del ${formatForMessage(cita.fecha_inicio, ctx.timeZone)}. Cuando quieras volver, aquí estaremos. 💜`,

  respuestaSinCita: (ctx: ContextoMensaje) =>
    `No encontramos ninguna cita próxima a tu nombre en *${ctx.negocio}*. Si quieres reservar, escríbenos y te atenderemos.`,

  respuestaNoEntendida: () => `Perdona, no te hemos entendido. ${INSTRUCCIONES}`,

  respuestaError: () => 'No hemos podido procesar tu respuesta. Por favor, llámanos y lo gestionamos enseguida.',
} as const;

const CONFIRMAR = /^(si|s|1|ok|vale|confirmo|confirmar|confirmado|claro|de acuerdo|alli estare|ahi estare)\b/;
const CANCELAR = /^(no|n|2|cancelar|cancelo|cancela|anular|anulo|no puedo|no podre)\b/;

/**
 * Interpreta la respuesta libre del cliente. Normaliza mayúsculas, tildes,
 * signos y emojis: "Sí!!", "SI", "sí, allí estaré 👍" -> confirmar.
 */
export function interpretarRespuesta(texto: string): RespuestaInterpretada {
  if (/^\s*👍/u.test(texto)) return 'confirmar';

  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ') // signos y emojis
    .replace(/\s+/g, ' ')
    .trim();

  if (CANCELAR.test(limpio)) return 'cancelar';
  if (CONFIRMAR.test(limpio)) return 'confirmar';
  return 'desconocida';
}
