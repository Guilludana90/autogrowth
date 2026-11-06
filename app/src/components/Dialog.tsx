'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Diálogo modal nativo (<dialog>): foco atrapado, Esc para cerrar y backdrop accesible. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      style={wide ? { width: 'min(860px, calc(100vw - 32px))' } : undefined}
    >
      {open && (
        <>
          <div className="dlg-head">
            <h2 id={titleId}>{title}</h2>
            <button className="btn ghost sm" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="dlg-body">{children}</div>
          {footer && <div className="dlg-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
