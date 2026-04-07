import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let Cached: SupabaseClient | null = null

/** Uses VITE_SUPABASE_ANON_KEY: Supabase "publishable" (sb_publishable_…) or legacy anon JWT — never the secret key. */
export function GetSupabase(): SupabaseClient | null {
  const Url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const Key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!Url || !Key) return null
  if (!Cached) {
    Cached = createClient(Url, Key)
  }
  return Cached
}

export function IsSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
}
