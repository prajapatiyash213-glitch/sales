'use client';
import { useLeads } from '@/hooks/useLeads';
import type { Profile } from '@/lib/types';
import Workspace from './Workspace';

export default function SalesShell({ me }: { me: Profile }) {
  const { leads, loading, error, reload } = useLeads();
  return <Workspace leads={leads} loading={loading} error={error} reload={reload} me={me} people={[me]} isAdmin={false} />;
}
