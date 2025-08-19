// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente normal (frontend, queries)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin (para auth, resets, etc.)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
