import { createClient } from '@supabase/supabase-js'
import { Database } from './types'

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// During build time, allow missing env vars - they'll be required at runtime
if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    throw new Error(
      'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }
}

// Create a singleton client for browser use
export const supabaseClient = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)
