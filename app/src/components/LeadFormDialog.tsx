'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { normalizeArPhone, normalizeEmail } from '@/lib/domain/phone';
import { ORGANIZATIONS, type OrganizationId } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

const schema = z
  .object({
    organizationId: z.enum(['cardys_fiat', 'overland_motors']),
    name: z.string().trim().min(2, 'Ingresá nombre y apellido').max(120),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
    modelInterest: z.string().trim().max(80).optional(),
    source: z.string().trim().min(1),
    campaignId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.phone && !normalizeArPhone(v.phone)) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Teléfono argentino inválido (ej. 2392 555101)' });
    if (v.email && !normalizeEmail(v.email)) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Email inválido' });
    if (!v.phone && !v.email) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Cargá teléfono o email' });
  });

export function LeadFormDialog({ open, onClose, defaultOrg }: { open: boolean; onClose: () => void; defaultOrg?: OrganizationId }) {
  const app = useApp();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [org, setOrg] = useState<OrganizationId>(defaultOrg ?? 'cardys_fiat');
  const writableOrgs = ORGANIZATIONS.filter((o) => app.allowed('lead:write', o.id));
  const campaigns = app.campaigns.filter((c) => c.organizationId === org);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = schema.safeParse({ ...fd, campaignId: fd.campaignId || undefined, phone: fd.phone || undefined, email: fd.email || undefined, modelInterest: fd.modelInterest || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const v = parsed.data;
      const lead = await app.createLead({
        organizationId: v.organizationId,
        name: v.name,
        phoneE164: normalizeArPhone(v.phone),
        email: normalizeEmail(v.email),
        modelInterest: v.modelInterest,
        source: v.source,
        campaignId: v.campaignId,
      });
      app.notify(`Lead creado: ${lead.name} (score ${lead.score})`);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} title="Nuevo lead" onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          <label className="lbl">
            Concesionario
            <select className="field" name="organizationId" value={org} onChange={(e) => setOrg(e.target.value as OrganizationId)}>
              {writableOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="lbl">
            Nombre y apellido *
            <input className="field" name="name" autoComplete="off" aria-invalid={!!errors.name} required />
            {errors.name && <span className="err">{errors.name}</span>}
          </label>
          <label className="lbl">
            Teléfono
            <input className="field" name="phone" inputMode="tel" placeholder="2392 555101" aria-invalid={!!errors.phone} />
            {errors.phone && <span className="err">{errors.phone}</span>}
          </label>
          <label className="lbl">
            Email
            <input className="field" name="email" type="email" aria-invalid={!!errors.email} />
            {errors.email && <span className="err">{errors.email}</span>}
          </label>
          <label className="lbl">
            Modelo de interés
            <input className="field" name="modelInterest" placeholder="Fiat Cronos" />
          </label>
          <label className="lbl">
            Origen
            <select className="field" name="source" defaultValue="Salón">
              {['Salón', 'WhatsApp', 'Teléfono', 'Referido', 'Meta Ads', 'Google Ads', 'Web'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="lbl" style={{ gridColumn: '1 / -1' }}>
            Campaña atribuida
            <select className="field" name="campaignId" defaultValue="">
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        {errors.form && <div className="notice error" role="alert">{errors.form}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear lead'}</button>
        </div>
      </form>
    </Dialog>
  );
}
