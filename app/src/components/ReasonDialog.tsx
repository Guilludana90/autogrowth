'use client';

import { useState } from 'react';
import { Dialog } from './Dialog';

/** Pide un texto obligatorio (motivo, comentario) antes de confirmar una acción. */
export function ReasonDialog({
  open,
  title,
  label,
  confirmLabel = 'Confirmar',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function confirm() {
    if (value.trim().length < 3) return setError('Escribí al menos 3 caracteres.');
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>Volver</button>
          <button className="btn" disabled={busy} onClick={confirm}>{busy ? 'Guardando…' : confirmLabel}</button>
        </>
      }
    >
      <label className="lbl">
        {label} *
        <textarea className="field" rows={3} maxLength={500} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      {error && <div className="notice error" role="alert">{error}</div>}
    </Dialog>
  );
}
