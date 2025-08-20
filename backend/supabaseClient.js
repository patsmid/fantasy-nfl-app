import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('❌ Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY');
}

// Cliente normal (seguro para frontend y backend básico)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cliente admin (SOLO backend, requiere SERVICE_ROLE_KEY)
export const supabaseAdmin = (() => {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ No se definió SUPABASE_SERVICE_ROLE_KEY, supabaseAdmin no estará disponible');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

/**
 * Crear cliente con sesión del usuario (usando su token JWT).
 * Útil en backend cuando recibes Authorization Bearer token del cliente.
 */
export function getSupabaseForUser(token) {
  if (!token) throw new Error('❌ No se proporcionó token de usuario');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
