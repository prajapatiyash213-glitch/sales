'use client';
import { useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import type { Profile } from '@/lib/types';
import Workspace from './Workspace';
import TeamView from './TeamView';
import ActivityView from './ActivityView';
import MembersView from './MembersView';

type Tab = 'leads' | 'team' | 'activity' | 'members';
const TABS: [Tab, string][] = [['leads', 'Leads'], ['team', 'Team'], ['activity', 'Activity log'], ['members', 'Members']];

export default function AdminShell({ me, people }: { me: Profile; people: Profile[] }) {
  const { leads, loading, error, reload } = useLeads();
  const [tab, setTab] = useState<Tab>('leads');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [attendedOnlyFilter, setAttendedOnlyFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''}
            onClick={() => {
              setTab(k);
              if (k === 'leads') {
                setOwnerFilter('all');
                setAttendedOnlyFilter(false);
                setStatusFilter('all');
              }
            }}>{n}</button>
        ))}
      </nav>
      {tab === 'leads' && (
        <Workspace
          key={`${ownerFilter}-${attendedOnlyFilter}-${statusFilter}`}
          leads={leads}
          loading={loading}
          error={error}
          reload={reload}
          me={me}
          people={people}
          isAdmin
          initialOwner={ownerFilter}
          initialAttendedOnly={attendedOnlyFilter}
          initialStatus={statusFilter}
        />
      )}
      {tab === 'team' && (
        <TeamView
          leads={leads}
          people={people}
          onOpenMember={(id, opts) => {
            setOwnerFilter(id);
            setAttendedOnlyFilter(opts?.attendedOnly ?? true);
            setStatusFilter(opts?.status ?? 'all');
            setTab('leads');
          }}
        />
      )}
      {tab === 'activity' && <ActivityView people={people} />}
      {tab === 'members' && <MembersView people={people} me={me} leads={leads} />}
    </>
  );
}
