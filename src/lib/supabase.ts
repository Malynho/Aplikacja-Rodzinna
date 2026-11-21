import { createClient } from '@supabase/supabase-js'

// Single shared Supabase client; keys come from .env.local (Vite exposes VITE_* vars).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
