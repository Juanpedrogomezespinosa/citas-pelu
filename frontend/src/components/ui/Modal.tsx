/**
 * Modal accesible como componente compuesto:
 *
 *   <Modal open={open} onClose={cerrar}>
 *     <Modal.Header>Título</Modal.Header>
 *     <Modal.Body>…</Modal.Body>
 *     <Modal.Footer>…</Modal.Footer>
 *   </Modal>
 *
 * Usa <dialog> nativo con showModal(): el navegador aporta gratis el foco
 * atrapado, el cierre con Escape, el `inert` del resto de la página y el
 * backdrop. El contexto conecta el título (aria-labelledby) y el cierre.
 */
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ModalContextValue {
  titleId: string;
  onClose: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('Los subcomponentes de Modal deben usarse dentro de <Modal>');
  return ctx;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

function ModalRoot({ open, onClose, size = 'md', children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape dispara "cancel": lo convertimos en onClose para que el estado de React mande
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Clic en el backdrop (fuera de la caja) cierra
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 text-stone-800 shadow-xl',
        SIZES[size],
        'open:motion-safe:animate-fade-in',
      )}
    >
      {open && <ModalContext.Provider value={{ titleId, onClose }}>{children}</ModalContext.Provider>}
    </dialog>
  );
}

function ModalHeader({ children }: { children: ReactNode }) {
  const { titleId, onClose } = useModal();
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
      <h2 id={titleId} className="font-display text-lg font-semibold text-stone-900">
        {children}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="-m-1 rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('max-h-[70vh] overflow-y-auto px-5 py-4', className)}>{children}</div>;
}

function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-stone-200 px-5 py-3 sm:flex-row sm:justify-end">{children}</div>;
}

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
});
