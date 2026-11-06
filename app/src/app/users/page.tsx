'use client';

import { useState, type FormEvent } from 'react';
import { PageHead } from '@/components/ui';
import { grantableRoles } from '@/lib/domain/permissions';
import { ORGANIZATIONS, ROLE_LABEL, orgName, type Member, type OrganizationId, type Role } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const ROLE_HELP: Record<Role, string> = {
  super_admin: 'Todo, incluida la aprobación de prompts de IA',
  dealership_admin: 'Gestiona su concesionario: usuarios operativos, listas de precios, aprobación de cotizaciones, importaciones',
  sales_advisor: 'Leads, tareas y cotizaciones (no aprueba ni asigna asesores)',
  post_sales: 'Postventa: ve leads, carga notas y tareas',
  read_only: 'Solo lectura',
};

export default function UsersPage() {
  const app = useApp();
  const { org } = useFilters();
  const { members } = useScoped(org);
  const manageable = ORGANIZATIONS.filter((o) => app.allowed('member:manage', o.id));
  const [mOrg, setMOrg] = useState<OrganizationId>(org !== 'all' && manageable.some((o) => o.id === org) ? org : (manageable[0]?.id ?? 'cardys_fiat'));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const myRole = app.roleFor(mOrg);
  const grantable = myRole ? grantableRoles(myRole) : [];

  if (!app.allowed('member:read', org)) {
    return (
      <>
        <PageHead eyebrow="Configuración" title="Usuarios y roles" />
        <div className="notice">Solo los administradores ven y gestionan usuarios.</div>
      </>
    );
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(undefined);
    try {
      const m = await app.addMember(mOrg, String(fd.get('email') ?? ''), String(fd.get('role')) as Role);
      app.notify(`${m.name}: ${ROLE_LABEL[m.role]} en ${orgName(m.organizationId)}`);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Member) {
    if (!confirm(`¿Quitar a ${m.name} de ${orgName(m.organizationId)}? Sus leads y tareas quedan sin asignar.`)) return;
    try {
      await app.removeMember(m);
      app.notify(`${m.name} ya no tiene acceso a ${orgName(m.organizationId)}`);
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  const sorted = [...members].sort((a, b) => a.organizationId.localeCompare(b.organizationId) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const canRemove = (m: Member) => {
    const r = app.roleFor(m.organizationId);
    return m.userId !== app.session?.userId && (r === 'super_admin' || (r === 'dealership_admin' && grantableRoles('dealership_admin').includes(m.role)));
  };

  return (
    <>
      <PageHead eyebrow="Configuración" title="Usuarios y roles" sub="Quién accede a cada concesionario y con qué permisos" />
      {manageable.length > 0 && grantable.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 12 }}>Dar acceso</h2>
          <form onSubmit={add} className="form-grid" style={{ gridTemplateColumns: '1fr 1.4fr 1fr auto', alignItems: 'end' }}>
            <label className="lbl">
              Concesionario
              <select className="field" value={mOrg} onChange={(e) => setMOrg(e.target.value as OrganizationId)}>
                {manageable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="lbl">
              Email
              <input className="field" type="email" name="email" required placeholder="asesor@concesionario.com" />
            </label>
            <label className="lbl">
              Rol
              <select className="field" name="role" defaultValue="sales_advisor">
                {grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Dar acceso'}</button>
          </form>
          {error && <div className="notice error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <p className="faint" style={{ marginBottom: 0 }}>
            {app.demo
              ? 'En la demo se crea un usuario ficticio.'
              : 'La persona tiene que estar invitada en Supabase Auth; acá se le asigna el rol en el concesionario.'}
          </p>
        </section>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Concesionario</th><th>Rol</th><th>Permisos</th><th></th></tr></thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={`${m.organizationId}-${m.userId}`}>
                  <td><strong>{m.name}</strong><div className="faint">{m.email ?? '—'}</div></td>
                  <td>{orgName(m.organizationId)}</td>
                  <td><span className={`tag ${m.role === 'super_admin' ? 'gold' : m.role === 'read_only' ? 'gray' : ''}`}>{ROLE_LABEL[m.role]}</span></td>
                  <td className="faint" style={{ maxWidth: 360 }}>{ROLE_HELP[m.role]}</td>
                  <td className="num">{canRemove(m) && <button className="btn danger sm" onClick={() => remove(m)}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="empty">Sin usuarios visibles.</div>}
        </div>
      </section>
    </>
  );
}
