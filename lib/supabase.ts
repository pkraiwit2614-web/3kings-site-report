import { createClient, SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const DEFAULT_KEY = 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

let client: SupabaseClient | null = null

export function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    )
  }
  return client
}
