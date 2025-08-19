// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ⚠️ Usa los valores de tu proyecto
const supabaseUrl = "https://cdmesdcgkcvogbgzqobt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbWVzZGNna2N2b2diZ3pxb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjM3ODIsImV4cCI6MjA2NzEzOTc4Mn0.QODh_sgbLeqNzYkXp8Ng3HflGaqBw5rf_sZHxanpZH8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
