/**
 * Piezas de validación reutilizables (zod) para todos los DTOs.
 *
 * Defensa en profundidad del texto libre:
 *  1. SQL: siempre sentencias preparadas (models/).
 *  2. XSS: React escapa al renderizar, pero además quitamos etiquetas HTML y
 *     caracteres de control antes de guardar, por si estos datos acaban en
 *     otro contexto (emails HTML, PDFs, mensajes de WhatsApp...).
 */
import { z } from 'zod';
import { env } from '../config/env.js';
import { normalizePhone } from '../utils/phone.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAGS = /<\/?[a-z][^>]*>/gi;

export const cleanText = (value: string): string => value.replace(CONTROL_CHARS, '').replace(HTML_TAGS, '').trim();

/** '' -> null: los campos vacíos de un formulario se guardan como NULL */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const requiredText = (max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, 'Campo obligatorio').max(max, `Máximo ${max} caracteres`));

/** Texto opcional: acepta '', null o undefined (undefined = "no tocar" en updates) */
export const optionalText = (max: number) =>
  z
    .preprocess(
      emptyToNull,
      z
        .string()
        .transform(cleanText)
        .pipe(z.string().max(max, `Máximo ${max} caracteres`))
        .nullable(),
    )
    .optional();

export const optionalEmail = z
  .preprocess(emptyToNull, z.string().trim().toLowerCase().pipe(z.email('Email no válido').max(150)).nullable())
  .optional();

export const phoneField = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value, { defaultCountryCode: env.WHATSAPP_DEFAULT_COUNTRY_CODE });
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'Teléfono no válido' });
    return z.NEVER;
  }
  return normalized;
});

export const optionalPhone = z.preprocess(emptyToNull, phoneField.nullable()).optional();

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD');
export const optionalDate = z.preprocess(emptyToNull, dateString.nullable()).optional();

export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'Formato YYYY-MM-DDTHH:mm');

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm');

export const positiveInt = z.coerce.number().int().positive();

export const idParamsSchema = z.object({ id: positiveInt });
export type IdParams = z.infer<typeof idParamsSchema>;

export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
};

/** Query string booleana ('true'/'false') */
export const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');
