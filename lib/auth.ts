import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

export async function requireProfile(): Promise<Profile> {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('YOUR-PROJECT');

  if (isPlaceholder) {
    redirect('/login');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile || !profile.active) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    redirect('/login?error=inactive');
  }
  return profile as Profile;
}
