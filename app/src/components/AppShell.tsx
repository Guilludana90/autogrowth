'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PRESET_LABEL, presetRange, type RangePreset } from '@/lib/domain/dates';
import { ORGANIZATIONS, ROLES, ROLE_LABEL, type OrgFilter, type Role } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';
import { NAV, PAGE_TITLE } from './nav';

function RangeControl() {
  const { range, today, setRange } = useFilters();
  const presets = Object.keys(PRESET_LABEL) as RangePreset[];
  const current = presets.find((p) => {
    const r = presetRange(p, today);
    return r.from === range.from && r.to === range.to;
  });
  const [custom, setCustom] = useState(!current);
  useEffect(() => setCustom(!current), [current]);

  return (
    <>
      <select
        className="field"
        aria-label="Rango de fechas"
        value={custom ? 'custom' : current}
        onChange={(e) => {
          if (e.target.value === 'custom') setCustom(true);
          else setRange(presetRange(e.target.value as RangePreset, today));
        }}
      >
        {presets.map((p) => (
          <option key={p} value={p}>
            {PRESET_LABEL[p]}
          </option>
        ))}
        <option value="custom">Personalizado…</option>
      </select>
      {custom && (
        <>
          <input
            className="field"
            type="date"
            aria-label="Desde"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange({ from: e.target.value, to: range.to })}
          />
          <input
            className="field"
            type="date"
            aria-label="Hasta"
            value={range.to}
            min={range.from}
            max={today}
            onChange={(e) => e.target.value && setRange({ from: range.from, to: e.target.value })}
          />
        </>
      )}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const app = useApp();
  const { org, setOrg, hrefWithFilters } = useFilters();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [pathname]);

  if (pathname === '/login') return <>{children}</>;

  const visibleOrgs = ORGANIZATIONS.filter((o) => app.demo || app.session?.roles[o.id]);
  const roleLabel = app.demo
    ? ROLE_LABEL[app.demoRole]
    : org !== 'all' && app.roleFor(org)
      ? ROLE_LABEL[app.roleFor(org)!]
      : 'Multi-concesionario';

  return (
    <div className="app" data-nav={navOpen ? 'open' : 'closed'}>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <Image src="/autogrowth-logo.webp" alt="AutoGrowth" width={36} height={36} priority />
          <div>
            <strong>AUTOGROWTH OS</strong>
            <small>
              <span className="star">✧</span> {roleLabel}
            </small>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="nav-group-label">{g.label.toUpperCase()}</div>
              {g.items.map((i) =>
                i.href ? (
                  <Link key={i.label} href={hrefWithFilters(i.href)} aria-current={pathname === i.href ? 'page' : undefined}>
                    {i.label}
                  </Link>
                ) : (
                  <span key={i.label} className="nav-soon" title={`Planificado para la fase ${i.phase}`}>
                    {i.label} <span className="soon">{i.phase}</span>
                  </span>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <b>{app.demo ? 'Modo demo' : (app.session?.userName ?? '')}</b>
          {app.demo ? 'Datos ficticios en este navegador. No se envía nada a sistemas externos.' : 'Conectado a Supabase.'}
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <button className="btn ghost sm menu-btn" aria-label="Abrir menú" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            ☰
          </button>
          <div className="crumb">
            {PAGE_TITLE[pathname] ?? 'AutoGrowth OS'}
            {app.demo && <span className="tag gold">✧ DEMO</span>}
          </div>
          <div className="filters">
            <select className="field" aria-label="Concesionario" value={org} onChange={(e) => setOrg(e.target.value as OrgFilter)}>
              <option value="all">Todos los concesionarios</option>
              {visibleOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <RangeControl />
            {app.demo && (
              <select className="field" aria-label="Rol de la demo" value={app.demoRole} onChange={(e) => app.setDemoRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    Rol: {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>
        <main className="content" id="contenido">
          {app.status === 'loading' && (
            <div className="stats" aria-busy="true" aria-label="Cargando">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" />
              ))}
            </div>
          )}
          {app.status === 'error' && <div className="notice error" role="alert">No se pudieron cargar los datos: {app.error}</div>}
          {app.status === 'signed_out' && (
            <div className="notice warn">
              Tu sesión no está iniciada. <Link href="/login">Ingresar</Link>
            </div>
          )}
          {app.status === 'ready' && children}
        </main>
      </div>
      {navOpen && <button className="nav-overlay" aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />}
      <div className="toasts" aria-live="polite">
        {app.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
