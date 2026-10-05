import type { ReactNode } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal de confirmación para acciones importantes (reservar, cancelar...) */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Volver',
  tone = 'primary',
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={pending ? () => undefined : onCancel} size="sm">
      <Modal.Header>{title}</Modal.Header>
      <Modal.Body className="space-y-3 text-sm text-stone-700">
        {children}
        {error && <Alert tone="error">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={pending} autoFocus>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
