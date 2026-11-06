import { readMetaConfig } from '@/lib/integrations/meta';

export const dynamic = 'force-dynamic';

/** Indica si el servidor está configurado para Meta. No expone valores, solo qué falta. */
export function GET() {
  const c = readMetaConfig(process.env);
  return Response.json(
    c.ok ? { enabled: true, version: c.config.version, allowedAdAccounts: c.config.allowedAdAccounts.length } : { enabled: false, reason: c.reason },
    { headers: { 'cache-control': 'no-store' } },
  );
}
