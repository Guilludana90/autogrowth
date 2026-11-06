'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DEMO_MODE, getSupabaseClient } from '@/lib/data';

export default function LoginPage() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const client = getSupabaseClient();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setState('sending');
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else setState('sent');
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section className="panel" style={{ width: 'min(420px, 100%)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Image src="/autogrowth-logo.webp" alt="" width={40} height={40} />
          <div>
            <h1 style={{ fontSize: 20 }}>AutoGrowth OS</h1>
            <span className="faint"><span className="star">✧</span> Acceso para equipos de Cardys y Overland</span>
          </div>
        </div>
        {DEMO_MODE || !client ? (
          <>
            <div className="notice">
              {DEMO_MODE ? 'La app está en modo demo: no hace falta ingresar.' : 'Supabase no está configurado.'}
            </div>
            <Link className="btn" href="/">Ir al Command Center</Link>
          </>
        ) : state === 'sent' ? (
          <div className="notice">Te enviamos un enlace de acceso. Revisá tu correo.</div>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <label className="lbl">
              Email de trabajo
              <input className="field" name="email" type="email" required autoComplete="email" />
            </label>
            {state === 'error' && <div className="notice error" role="alert">{message}</div>}
            <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : 'Recibir enlace de acceso'}</button>
            <p className="faint">Solo pueden ingresar usuarios dados de alta por un administrador.</p>
          </form>
        )}
      </section>
    </main>
  );
}
