import type { ReactNode } from 'react';
import { STATUS_LABEL, type LeadStatus } from '@/lib/domain/types';

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">
          <span className="star">✧</span> {eyebrow}
        </div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

const STATUS_TONE: Record<LeadStatus, string> = { new: '', contacted: 'gray', negotiation: 'gold', won: 'green', lost: 'red' };

export function StatusTag({ status }: { status: LeadStatus }) {
  return <span className={`tag ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function ScoreBadge({ score, reason }: { score?: number; reason?: string }) {
  if (score === undefined) return <span className="faint">—</span>;
  const tone = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--champagne)' : 'var(--muted)';
  return (
    <span title={reason ? `Score rules-v1: ${reason}` : undefined} style={{ color: tone, fontWeight: 700 }}>
      ● {score}
    </span>
  );
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
