import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'error' | 'success' | 'info';

interface AlertProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const TONES: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

/** Mensaje en línea. Los errores se anuncian a lectores de pantalla (role=alert) */
export function Alert({ tone = 'info', children, className }: AlertProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', TONES[tone], className)}>
      {children}
    </div>
  );
}
