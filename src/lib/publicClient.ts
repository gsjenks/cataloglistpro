// src/lib/publicClient.ts
// Shared anonymous Supabase client for public (no-auth) buyer pages, so we don't
// spin up multiple GoTrueClient instances across the public routes.

import { createClient } from '@supabase/supabase-js';

export const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
