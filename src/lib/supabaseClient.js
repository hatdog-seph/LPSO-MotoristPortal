import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill these in from your Supabase project settings.'
  );
}

// The motorist portal never queries Supabase tables directly - every
// citation lookup goes through the motorist-login / motorist-session
// edge functions, which use the service role key server-side. That
// keeps citation data from being readable by anyone who just has the
// public anon key.
export const supabase = createClient(url, anonKey);
