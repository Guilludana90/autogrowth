'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { sanitizeRange, toDay } from '../domain/dates';
import type { DateRange, OrgFilter } from '../domain/types';
import { isOrganizationId } from '../domain/types';

/**
 * Filtros globales en la URL (?org=&from=&to=): se conservan al navegar, se pueden compartir
 * y sobreviven a un refresh. Valores inválidos vuelven al default.
 */
export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = toDay(new Date());

  const org: OrgFilter = isOrganizationId(params.get('org')) ? (params.get('org') as OrgFilter) : 'all';
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const range: DateRange = useMemo(() => sanitizeRange(fromParam, toParam, today), [fromParam, toParam, today]);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Href que conserva los filtros globales al cambiar de pantalla. */
  const hrefWithFilters = useCallback(
    (path: string) => {
      const keep = new URLSearchParams();
      for (const k of ['org', 'from', 'to']) {
        const v = params.get(k);
        if (v) keep.set(k, v);
      }
      const qs = keep.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [params],
  );

  return {
    org,
    range,
    today,
    setOrg: (o: OrgFilter) => update({ org: o === 'all' ? null : o }),
    setRange: (r: DateRange) => update({ from: r.from, to: r.to }),
    update,
    hrefWithFilters,
  };
}
