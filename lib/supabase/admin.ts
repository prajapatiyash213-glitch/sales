import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS — use ONLY in server actions after checking the caller is an admin.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Settings → Environment Variables.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
