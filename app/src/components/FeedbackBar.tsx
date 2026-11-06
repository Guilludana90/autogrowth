'use client';

import { useState } from 'react';
import type { CampaignRecommendation } from '@/lib/domain/recommendations';
import type { Campaign, RecommendationRun } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

/**
 * Útil / no útil sobre una recomendación. La primera respuesta guarda una corrida (snapshot inmutable del
 * diagnóstico mostrado) y el feedback queda atado a ella; volver a responder cambia la respuesta propia.
 */
export function FeedbackBar({ campaign, rec, run: given }: { campaign: Campaign; rec: CampaignRecommendation; run?: RecommendationRun }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const canGive = app.allowed('recommendation:feedback', campaign.organizationId);

  const run =
    given ??
    app.runs.find(
      (r) =>
        r.organizationId === campaign.organizationId &&
        r.platform === campaign.platform &&
        r.campaignId === campaign.id &&
        r.engine === rec.engine &&
        r.version === rec.version &&
        r.windowFrom === rec.window?.from &&
        r.windowTo === rec.window?.to &&
        r.priority === rec.priority &&
        r.problemArea === rec.problemArea,
    );
  const mine = run ? app.feedback.find((f) => f.runId === run.id && f.userId === app.session?.userId) : undefined;
  const all = run ? app.feedback.filter((f) => f.runId === run.id) : [];

  async function send(useful: boolean, text?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const r = await app.ensureRun(campaign.organizationId, campaign.platform, rec, run);
      await app.submitFeedback(r, useful, text);
      app.notify(useful ? 'Gracias: marcada como útil' : 'Gracias: marcada como no útil');
      setAsking(false);
      setComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canGive) return <span className="faint">{all.length ? `${all.filter((f) => f.useful).length}/${all.length} útil` : 'Tu rol no califica recomendaciones'}</span>;

  return (
    <span className="feedback" role="group" aria-label={`Feedback sobre ${campaign.name}`}>
      <span className="faint">¿Te sirvió?</span>
      <button className="btn secondary sm" aria-pressed={mine?.useful === true} disabled={busy} onClick={() => send(true)}>
        Útil
      </button>
      <button className="btn secondary sm" aria-pressed={mine?.useful === false} disabled={busy} onClick={() => setAsking(true)}>
        No útil
      </button>
      {all.length > 0 && <span className="faint">{all.filter((f) => f.useful).length}/{all.length} útil</span>}
      {error && !asking && <span className="faint" style={{ color: 'var(--red)' }} role="alert">{error}</span>}
      <Dialog
        open={asking}
        title="¿Qué no sirvió?"
        onClose={() => setAsking(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setAsking(false)}>Cancelar</button>
            <button className="btn" disabled={busy} onClick={() => send(false, comment)}>
              {busy ? 'Guardando…' : 'Guardar feedback'}
            </button>
          </>
        }
      >
        <p className="faint">El comentario es opcional y lo ve el equipo en AI Governance para mejorar prompts y reglas. No escribas datos personales de clientes.</p>
        <label className="lbl" htmlFor={`fb-${campaign.id}`}>Comentario (hasta 500 caracteres)</label>
        <textarea id={`fb-${campaign.id}`} className="field" style={{ minHeight: 90, fontFamily: 'inherit' }} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
        {error && <div className="notice error" role="alert">{error}</div>}
      </Dialog>
    </span>
  );
}
