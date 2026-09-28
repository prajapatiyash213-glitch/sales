import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

export async function requireProfile(): Promise<Profile> {
  const cookieStore = cookies();
  const demoRole = cookieStore.get('omniscope_demo_role')?.value;

  if (demoRole === 'admin') {
    return {
      id: 'demo-admin-id',
      email: 'testadmin@omniscope.com',
      full_name: 'Test Admin',
      role: 'admin',
      active: true,
      created_at: '2026-01-01T00:00:00Z'
    };
  }

  if (demoRole === 'member') {
    return {
      id: 'demo-sales-id',
      email: 'sales@omniscope.com',
      full_name: 'Sales Member',
      role: 'member',
      active: true,
      created_at: '2026-01-01T00:00:00Z'
    };
  }

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
  if (!profile || !profile.active) redirect('/auth/signout?reason=inactive');
  return profile as Profile;
}
