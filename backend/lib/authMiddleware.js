import { supabaseAuth, getSupabaseForUser } from '../supabaseClients.js';

export async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });

  req.user = data.user;
  req.supabase = getSupabaseForUser(token); // cliente con RLS ligado a ese token
  next();
}
