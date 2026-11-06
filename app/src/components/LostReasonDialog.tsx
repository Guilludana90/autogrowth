'use client';

import { useState } from 'react';
import { Dialog } from './Dialog';

const REASONS = ['Precio', 'Compró en otro concesionario', 'Sin financiación aprobada', 'No responde', 'Sin stock del modelo', 'Otro'];

export function LostReasonDialog({ open, leadName, onCancel, onConfirm }: { open: boolean; leadName: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(REASONS[0]!);
  const [other, setOther] = useState('');
  const value = reason === 'Otro' ? other.trim() : reason;
  return (
    <Dialog
      open={open}
      title={`Marcar como perdido · ${leadName}`}
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn" disabled={!value} onClick={() => onConfirm(value)}>Confirmar</button>
        </>
      }
    >
      <label className="lbl">
        Motivo de pérdida
        <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      {reason === 'Otro' && (
        <label className="lbl">
          Detalle
          <input className="field" value={other} onChange={(e) => setOther(e.target.value)} maxLength={140} autoFocus />
        </label>
      )}
    </Dialog>
  );
}
