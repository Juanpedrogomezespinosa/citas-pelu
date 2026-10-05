import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 focus-visible:ring-brand-500',
  secondary: 'border border-stone-300 bg-white text-stone-800 shadow-xs hover:bg-stone-50 focus-visible:ring-brand-500',
  ghost: 'text-stone-700 hover:bg-stone-100 focus-visible:ring-brand-500',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 focus-visible:ring-red-500',
};

const SIZES: Record<Size, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap',
        SIZES[size],
        VARIANTS[variant],
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}
