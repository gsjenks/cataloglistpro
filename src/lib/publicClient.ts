// src/lib/publicClient.ts
// Shared anonymous Supabase client for public (no-auth) buyer pages.
//
// IMPORTANT: this client must NOT share the auth-token lock/storage with the
// main app client (lib/supabase.ts). Two clients using the same storageKey
// contend for the GoTrue Navigator lock, which caused session-check timeouts
// and dashboard load failures. Public pages are anonymous, so we disable
// session persistence/refresh and give it a distinct storageKey.

import { createClient } from '@supabase/supabase-js';

export const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'sb-public-anon',
    },
  },
);
