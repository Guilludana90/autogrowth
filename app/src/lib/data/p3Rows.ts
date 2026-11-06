import type { OrganizationId, Platform, PromptEvent, PromptVersion, RecommendationFeedback, RecommendationRun } from '../domain/types';

/* Filas P3 tal como vienen de Postgres (snake_case) y su conversión. La usan el cliente y las rutas del servidor. */

export interface PromptRow {
  id: string;
  organization_id: OrganizationId;
  name: PromptVersion['name'];
  version: string;
  prompt_text: string;
  change_note: string | null;
  status: PromptVersion['status'];
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  decided_reason: string | null;
  submitted_at: string | null;
  activated_at: string | null;
  created_at: string;
}

export const toPrompt = (r: PromptRow, names: Map<string, string>): PromptVersion => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  version: r.version,
  promptText: r.prompt_text,
  changeNote: r.change_note ?? undefined,
  status: r.status,
  createdBy: r.created_by,
  createdByName: names.get(r.created_by),
  approvedByName: r.approved_by ? (names.get(r.approved_by) ?? 'Super Admin') : undefined,
  approvedAt: r.approved_at ?? undefined,
  decidedReason: r.decided_reason ?? undefined,
  submittedAt: r.submitted_at ?? undefined,
  activatedAt: r.activated_at ?? undefined,
  createdAt: r.created_at,
});

export interface PromptEventRow {
  id: string;
  version_id: string;
  from_status: PromptEvent['fromStatus'] | null;
  to_status: PromptEvent['toStatus'];
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export const toPromptEvent = (r: PromptEventRow, names: Map<string, string>): PromptEvent => ({
  id: r.id,
  versionId: r.version_id,
  fromStatus: r.from_status ?? undefined,
  toStatus: r.to_status,
  actorName: r.actor_id ? names.get(r.actor_id) : undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});

export interface RunRow {
  id: string;
  organization_id: OrganizationId;
  platform: Platform;
  campaign_id: string;
  window_from: string;
  window_to: string;
  engine: RecommendationRun['engine'];
  version: string;
  prompt_version_id: string | null;
  priority: RecommendationRun['priority'];
  problem_area: RecommendationRun['problemArea'];
  confidence: number | string;
  payload: unknown;
  created_at: string;
}

export const toRun = (r: RunRow): RecommendationRun => ({
  id: r.id,
  organizationId: r.organization_id,
  platform: r.platform,
  campaignId: r.campaign_id,
  windowFrom: r.window_from,
  windowTo: r.window_to,
  engine: r.engine,
  version: r.version,
  promptVersionId: r.prompt_version_id ?? undefined,
  priority: r.priority,
  problemArea: r.problem_area,
  confidence: Number(r.confidence),
  payload: r.payload,
  createdAt: r.created_at,
});

export interface FeedbackRow {
  id: string;
  organization_id: OrganizationId;
  run_id: string;
  useful: boolean;
  comment: string | null;
  user_id: string;
  created_at: string;
}

export const toFeedback = (r: FeedbackRow, names: Map<string, string>): RecommendationFeedback => ({
  id: r.id,
  organizationId: r.organization_id,
  runId: r.run_id,
  useful: r.useful,
  comment: r.comment ?? undefined,
  userId: r.user_id,
  userName: names.get(r.user_id),
  createdAt: r.created_at,
});
