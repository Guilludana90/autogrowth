'use client';

import { useState } from 'react';
import { STATUS_LABEL, type Lead, type LeadStatus } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { LostReasonDialog } from './LostReasonDialog';

/** Cambio de estado compartido por tabla y pipeline: "Perdido" siempre pide motivo. */
export function useStatusChange() {
  const app = useApp();
  const [pending, setPending] = useState<Lead | null>(null);

  async function apply(lead: Lead, status: LeadStatus, lostReason?: string) {
    try {
      await app.updateLead(lead.id, { status, lostReason });
      app.notify(`${lead.name}: ${STATUS_LABEL[status]}`);
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  function change(lead: Lead, status: LeadStatus) {
    if (status === lead.status) return;
    if (status === 'lost') setPending(lead);
    else void apply(lead, status);
  }

  const dialog = (
    <LostReasonDialog
      open={pending !== null}
      leadName={pending?.name ?? ''}
      onCancel={() => setPending(null)}
      onConfirm={(reason) => {
        if (pending) void apply(pending, 'lost', reason);
        setPending(null);
      }}
    />
  );

  return { change, dialog };
}
