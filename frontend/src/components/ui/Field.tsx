import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  className?: string;
  /** Recibe los atributos de accesibilidad que debe llevar el control */
  children: (a11y: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}

/**
 * Etiqueta + control + ayuda/error, con la accesibilidad cableada:
 * <label for>, aria-invalid y aria-describedby apuntando al mensaje de error.
 */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
        {required && (
          <span className="text-brand-700" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, ...(error ? { 'aria-invalid': true as const } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {error ? (
        <p id={messageId} className="text-xs text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs text-stone-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn('control', className)} {...props} />
);

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn('control', className)} {...props} />
);

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn('control min-h-20 resize-y', className)} {...props} />
);
