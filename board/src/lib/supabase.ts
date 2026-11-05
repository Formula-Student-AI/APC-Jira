import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

// The publishable (anon) key is meant to be public: Row Level Security protects the data.
// Placeholders keep createClient from throwing when a build has no settings (App shows CONFIG_ERROR).
export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'fsai-board-auth',
  },
})
