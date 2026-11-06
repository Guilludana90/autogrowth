'use client';

import { PageHead } from '@/components/ui';
import { supabaseConfigured } from '@/lib/data';
import { useApp } from '@/lib/state/AppContext';

/** Estado honesto de cada integración: nada figura como conectado sin una conexión real y probada. */
export default function SystemPage() {
  const app = useApp();
  const items: Array<[string, string, string, string]> = [
    ['Frontend', 'Next.js + TypeScript', 'Disponible', 'green'],
    ['Modo demo', app.demo ? 'Datos ficticios en este navegador; envíos y sincronizaciones externas bloqueados' : 'Desactivado', app.demo ? 'Activo' : 'Inactivo', app.demo ? 'gold' : 'gray'],
    ['Supabase Auth + Postgres + RLS', supabaseConfigured ? 'Variables configuradas' : 'Sin configurar (ver app/README.md)', !app.demo && supabaseConfigured ? 'Conectado' : 'No conectado', !app.demo && supabaseConfigured ? 'green' : 'gray'],
    ['Meta Ads (OAuth, Lead Ads, CAPI)', 'Planificado para P2, en sandbox y con autorización explícita', 'No conectado', 'gray'],
    ['Google Ads', 'Después de Meta', 'No conectado', 'gray'],
    ['WhatsApp Business', 'P4. No se toca el WhatsApp operativo', 'No conectado', 'gray'],
    ['Tecnom', 'Solo importación CSV manual y reversible. Nunca se escribe en Tecnom', 'CSV manual', 'amber'],
    ['Documentos (Storage)', 'Las listas de precios guardan sus filas validadas; el archivo original irá a Supabase Storage privado', 'Pendiente', 'gray'],
    ['IA generativa', 'P3. Hoy las recomendaciones usan el motor de reglas rules-v1', 'No conectado', 'gray'],
  ];
  return (
    <>
      <PageHead eyebrow="Configuración" title="Estado del sistema" sub="Qué está conectado de verdad y qué no" />
      <section className="panel">
        {items.map(([name, detail, label, tone]) => (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div>
              <b>{name}</b>
              <div className="faint">{detail}</div>
            </div>
            <span className={`tag ${tone}`}>{label}</span>
          </div>
        ))}
      </section>
      {app.demo && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Datos de demostración</h2>
          <p className="muted">Restaura los leads ficticios y borra lo que cargaste o importaste en este navegador.</p>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('¿Restaurar los datos de demostración? Se pierden los cambios hechos en este navegador.')) return;
              await app.resetDemo();
              app.notify('Datos de demostración restaurados');
            }}
          >
            Restaurar datos demo
          </button>
        </section>
      )}
    </>
  );
}
