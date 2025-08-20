// authHelpers.js  (puede estar inline al principio de manualLeagues.js)
export async function getAccessTokenFromClient() {
  try {
    // Intentamos importar el cliente supabase del frontend (igual que extras.js)
    const mod = await import('./supabaseClient.js').catch(() => null);
    const supa = mod?.supabase || window?.supabase;
    if (!supa) return null;
    const { data } = await supa.auth.getSession();
    // data.session o data?.session depende de versión; adaptamos:
    const session = data?.session ?? (data?.session ?? null);
    return session?.access_token || null;
  } catch (err) {
    return null;
  }
}

export async function getUserIdFromClient() {
  try {
    const mod = await import('./supabaseClient.js').catch(() => null);
    const supa = mod?.supabase || window?.supabase;
    if (!supa) return null;
    const { data } = await supa.auth.getSession();
    const session = data?.session ?? null;
    const user = session?.user ?? null;
    // si la API devuelve { data: { user } } usar data?.user
    if (user && user.id) return user.id;
    // fallback: supa.auth.getUser()
    const maybe = await supa.auth.getUser().catch(() => null);
    return maybe?.data?.user?.id ?? null;
  } catch (err) {
    console.warn('getUserIdFromClient error:', err);
    return null;
  }
}
