import { describe, expect, it } from 'vitest';
import { buildAuthUrl, buildInsightsUrl, leadsFromActions, mapInsights, normalizeAdAccountId, readMetaConfig, toRpcRows, validateSyncRange } from '@/lib/integrations/meta';
import { appSecretProof, signState, verifyState } from '@/lib/integrations/meta.server';

const SECRET = 'x'.repeat(40);
const FULL_ENV = {
  NEXT_PUBLIC_DEMO_MODE: 'false',
  META_APP_ID: '123',
  META_APP_SECRET: 'shh',
  META_REDIRECT_URI: 'http://localhost:3000/api/integrations/meta/callback',
  META_ALLOWED_AD_ACCOUNTS: 'act_1234567, 7654321, basura',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  INTEGRATION_STATE_SECRET: SECRET,
};

describe('configuración de Meta', () => {
  it('apagada en modo demo, aunque haya credenciales', () => {
    expect(readMetaConfig({ ...FULL_ENV, NEXT_PUBLIC_DEMO_MODE: undefined })).toEqual({ ok: false, reason: expect.stringMatching(/Modo demo/) });
    expect(readMetaConfig({ ...FULL_ENV, NEXT_PUBLIC_DEMO_MODE: 'true' }).ok).toBe(false);
  });
  it('lista exactamente lo que falta', () => {
    const r = readMetaConfig({ NEXT_PUBLIC_DEMO_MODE: 'false', META_APP_ID: '1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/META_APP_SECRET.*SUPABASE_SERVICE_ROLE_KEY/);
  });
  it('exige lista de cuentas autorizadas y normaliza los IDs', () => {
    const r = readMetaConfig(FULL_ENV);
    expect(r.ok && r.config.allowedAdAccounts).toEqual(['act_1234567', 'act_7654321']);
    expect(readMetaConfig({ ...FULL_ENV, META_ALLOWED_AD_ACCOUNTS: 'nada' }).ok).toBe(false);
    expect(readMetaConfig({ ...FULL_ENV, INTEGRATION_STATE_SECRET: 'corto' }).ok).toBe(false);
  });
});

describe('URLs de Graph API', () => {
  it('OAuth pide solo ads_read', () => {
    const u = new URL(buildAuthUrl({ appId: '1', redirectUri: 'http://x/cb', state: 's' }));
    expect(u.searchParams.get('scope')).toBe('ads_read');
    expect(u.searchParams.get('state')).toBe('s');
    expect(u.toString()).not.toMatch(/secret/);
  });
  it('insights por campaña y por día', () => {
    const u = new URL(buildInsightsUrl({ adAccountId: 'act_1', range: { from: '2026-10-01', to: '2026-10-31' } }));
    expect(u.pathname).toMatch(/\/act_1\/insights$/);
    expect(u.searchParams.get('level')).toBe('campaign');
    expect(u.searchParams.get('time_increment')).toBe('1');
    expect(JSON.parse(u.searchParams.get('time_range')!)).toEqual({ since: '2026-10-01', until: '2026-10-31' });
  });
  it('valida cuentas y rangos', () => {
    expect(normalizeAdAccountId('act_12345')).toBe('act_12345');
    expect(normalizeAdAccountId(' 12345 ')).toBe('act_12345');
    expect(normalizeAdAccountId('act_abc')).toBeUndefined();
    expect(validateSyncRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-06')).toBeUndefined();
    expect(validateSyncRange({ from: '2026-10-31', to: '2026-10-01' }, '2026-11-06')).toMatch(/invertido/);
    expect(validateSyncRange({ from: '2026-11-01', to: '2026-11-07' }, '2026-11-06')).toMatch(/futuros/);
    expect(validateSyncRange({ from: '2026-01-01', to: '2026-11-01' }, '2026-11-06')).toMatch(/Máximo/);
  });
});

describe('normalización de insights', () => {
  const page = {
    data: [
      {
        campaign_id: '120001',
        campaign_name: 'Cronos Leads',
        objective: 'OUTCOME_LEADS',
        spend: '15000.5',
        impressions: '12000',
        inline_link_clicks: '300',
        account_currency: 'ARS',
        actions: [
          { action_type: 'link_click', value: '300' },
          { action_type: 'lead', value: '25' },
          { action_type: 'onsite_conversion.lead_grouped', value: '25' },
        ],
        date_start: '2026-10-01',
        date_stop: '2026-10-01',
      },
      { campaign_id: '120001', campaign_name: 'Cronos Leads', spend: '10', impressions: '100', date_start: '2026-10-01', date_stop: '2026-10-31' },
      { campaign_name: 'sin id', date_start: '2026-10-01' },
    ],
  };
  it('lleva cada fila al modelo diario sin contar dos veces los leads', () => {
    const r = mapInsights([page], 'cardys_fiat');
    expect(r.metrics).toEqual([
      { organizationId: 'cardys_fiat', platform: 'meta', campaignId: '120001', date: '2026-10-01', currency: 'ARS', spend: 15000.5, impressions: 12000, clicks: 300, platformLeads: 25 },
    ]);
    expect(r.campaigns[0]).toMatchObject({ id: '120001', name: 'Cronos Leads', objective: 'OUTCOME_LEADS' });
    expect(r.skipped.map((s) => s.reason)).toEqual(['fila de varios días', 'sin campaña o fecha']);
    expect(toRpcRows(r.metrics, new Map([['120001', 'Cronos Leads']]))[0]).toMatchObject({ campaign_id: '120001', campaign_name: 'Cronos Leads', platform_leads: 25 });
  });
  it('usa el alias de lead disponible y si no hay, 0', () => {
    expect(leadsFromActions([{ action_type: 'onsite_conversion.lead_grouped', value: '4' }])).toBe(4);
    expect(leadsFromActions([{ action_type: 'link_click', value: '9' }])).toBe(0);
    expect(leadsFromActions(undefined)).toBe(0);
  });
  it('propaga errores de Meta', () => {
    expect(() => mapInsights([{ error: { message: 'Invalid OAuth access token' } }], 'cardys_fiat')).toThrow(/Invalid OAuth/);
  });
});

describe('state OAuth firmado', () => {
  const p = { org: 'cardys_fiat' as const, userId: 'u1', adAccountId: 'act_1', exp: Date.now() + 60_000 };
  it('ida y vuelta', () => {
    expect(verifyState(signState(p, SECRET), SECRET)).toMatchObject(p);
  });
  it('rechaza firma alterada, otro secreto y vencido', () => {
    const s = signState(p, SECRET);
    const [payload] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ ...p, org: 'overland_motors' })).toString('base64url');
    expect(() => verifyState(`${forged}.${s.split('.')[1]}`, SECRET)).toThrow(/firma/);
    expect(() => verifyState(s, 'y'.repeat(40))).toThrow(/firma/);
    expect(() => verifyState(`${payload}`, SECRET)).toThrow(/inválido/);
    expect(() => verifyState(signState({ ...p, exp: Date.now() - 1 }, SECRET), SECRET)).toThrow(/vencido/);
  });
  it('appsecret_proof es HMAC-SHA256 del token', () => {
    expect(appSecretProof('tok', 'sec')).toMatch(/^[0-9a-f]{64}$/);
    expect(appSecretProof('tok', 'sec')).not.toBe(appSecretProof('tok', 'otro'));
  });
});
