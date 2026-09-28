import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import SalesShell from '@/components/SalesShell';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const me = await requireProfile();
  if (me.role === 'admin') redirect('/admin');
  return (
    <>
      <AppHeader profile={me} />
      <main className="wrap"><SalesShell me={me} /></main>
    </>
  );
}
