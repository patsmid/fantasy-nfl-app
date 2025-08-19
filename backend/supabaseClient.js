import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('❌ Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY');
}

// Cliente normal (frontend, queries)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cliente admin (para auth, resets, etc.)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
/**
 * Helper para crear un cliente impersonando al usuario con su JWT
 */
export function getSupabaseForUser(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
