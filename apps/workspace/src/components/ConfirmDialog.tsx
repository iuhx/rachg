import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConfirming, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="workspace-modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) onCancel();
      }}
    >
      <div className="workspace-modal w-full max-w-sm bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 p-5" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
        <div className="flex items-start gap-3">
          <div className="workspace-empty-icon w-9 h-9 mb-0 text-red-500 bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="type-section-heading text-neutral-900 dark:text-white">{title}</h2>
            <p id="confirm-dialog-description" className="type-secondary mt-1 leading-relaxed">{description}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={isConfirming} aria-label="Close confirmation" className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={isConfirming} className="workspace-button workspace-button-secondary cursor-pointer disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={isConfirming} className="workspace-button bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50">{isConfirming ? 'Deleting…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};
