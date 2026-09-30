import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import AdminShell from '@/components/AdminShell';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DEMO_PEOPLE: Profile[] = [
  { id: 'demo-admin-id', email: 'yash.tecnoprism@gmail.com', full_name: 'Yash Prajapati', role: 'admin', active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-sales-id', email: 'shivamprajapati12sp12@gmail.com', full_name: 'shivam p', role: 'member', active: true, created_at: '2026-01-01T00:00:00Z' }
];

export default async function AdminPage() {
  const me = await requireProfile();
  if (me.role !== 'admin') redirect('/sales');

  const demoRole = cookies().get('omniscope_demo_role')?.value;
  if (demoRole) {
    return (
      <>
        <AppHeader profile={me} />
        <main className="wrap"><AdminShell me={me} people={DEMO_PEOPLE} /></main>
      </>
    );
  }

  const { data } = await createClient().from('profiles').select('*').order('full_name');
  const people = (data as Profile[]) ?? [me];

  return (
    <>
      <AppHeader profile={me} />
      <main className="wrap"><AdminShell me={me} people={people} /></main>
    </>
  );
}
