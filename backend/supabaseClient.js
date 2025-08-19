import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
// Opcional, sólo para tareas admin fuera del CRUD usuario:
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(url, anon);

// Para login/refresh/verificación de usuario
export const supabaseAuth = createClient(url, anon, { auth: { persistSession: false } });

// Cliente por request que “actúa como el usuario” usando su access token (RLS aplica)
export function getSupabaseForUser(accessToken) {
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}
