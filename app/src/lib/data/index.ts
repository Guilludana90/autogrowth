import { createBrowserClient } from '@supabase/ssr';
import { DemoRepository } from './demoRepository';
import type { Repository } from './repository';
import { SupabaseRepository } from './supabaseRepository';

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let repo: Repository | null = null;

/**
 * DEMO_MODE=true (por defecto) nunca crea un cliente de red: todo queda en el navegador.
 * Con DEMO_MODE=false hace falta Supabase configurado; si no lo está, se informa en pantalla en vez de simular.
 */
export function getRepository(): Repository {
  if (repo) return repo;
  if (DEMO_MODE) repo = new DemoRepository();
  else {
    if (!supabaseConfigured) throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY');
    repo = new SupabaseRepository(createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return repo;
}

export function getSupabaseClient() {
  if (DEMO_MODE || !supabaseConfigured) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
