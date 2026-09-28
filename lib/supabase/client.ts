import { createBrowserClient } from '@supabase/ssr';

const INITIAL_DEMO_LEADS = [
  {
    id: 'lead-1',
    email: 'contact@acme.com',
    brand: 'Acme Corp',
    owner_id: 'demo-admin-id',
    lead_date: '2026-09-20',
    lead_source: 'Website',
    lead_stage: 'Meeting Scheduled',
    date_of_connect: '2026-09-22',
    comments: 'Interested in enterprise sales pipeline tooling.',
    followup2_date: '2026-10-05',
    followup2_comments: 'Send revised pricing proposal.',
    lead_status: 'Active',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-22T14:30:00Z'
  },
  {
    id: 'lead-2',
    email: 'sales@globex.com',
    brand: 'Globex Inc',
    owner_id: 'demo-sales-id',
    lead_date: '2026-09-25',
    lead_source: 'LinkedIn',
    lead_stage: 'New',
    date_of_connect: null,
    comments: 'Inbound lead from LinkedIn campaign.',
    followup2_date: null,
    followup2_comments: null,
    lead_status: 'Active',
    created_at: '2026-09-25T11:00:00Z',
    updated_at: '2026-09-25T11:00:00Z'
  },
  {
    id: 'lead-3',
    email: 'hello@nexus.io',
    brand: 'Nexus Systems',
    owner_id: 'demo-admin-id',
    lead_date: '2026-09-15',
    lead_source: 'Referral',
    lead_stage: 'Proposal Sent',
    date_of_connect: '2026-09-18',
    comments: 'Demo completed. Decision expected next week.',
    followup2_date: '2026-09-29',
    followup2_comments: 'Follow up on contract approval.',
    lead_status: 'Active',
    created_at: '2026-09-15T09:00:00Z',
    updated_at: '2026-09-18T16:00:00Z'
  },
  {
    id: 'lead-4',
    email: 'support@vertex.com',
    brand: 'Vertex Digital',
    owner_id: 'demo-sales-id',
    lead_date: '2026-09-10',
    lead_source: 'Outbound',
    lead_stage: 'Won',
    date_of_connect: '2026-09-12',
    comments: 'Closed annual subscription contract.',
    followup2_date: null,
    followup2_comments: null,
    lead_status: 'Converted',
    created_at: '2026-09-10T14:00:00Z',
    updated_at: '2026-09-24T12:00:00Z'
  },
  {
    id: 'lead-5',
    email: 'info@cyberdyne.org',
    brand: 'Cyberdyne Systems',
    owner_id: 'demo-sales-id',
    lead_date: '2026-09-22',
    lead_source: 'Cold Call',
    lead_stage: 'Negotiation',
    date_of_connect: '2026-09-23',
    comments: 'Discussing tier 2 discount.',
    followup2_date: '2026-09-30',
    followup2_comments: 'Call CFO for final signoff.',
    lead_status: 'Active',
    created_at: '2026-09-22T08:00:00Z',
    updated_at: '2026-09-23T15:00:00Z'
  }
];

const INITIAL_DEMO_PROFILES = [
  { id: 'demo-admin-id', email: 'testadmin@omniscope.com', full_name: 'Test Admin', role: 'admin', active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'demo-sales-id', email: 'sales@omniscope.com', full_name: 'Sales Member', role: 'member', active: true, created_at: '2026-01-01T00:00:00Z' }
];

function isDemoMode() {
  if (typeof window === 'undefined') return true;
  return (
    document.cookie.includes('omniscope_demo_role=') ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('YOUR-PROJECT')
  );
}

function getStoredLeads() {
  if (typeof window === 'undefined') return INITIAL_DEMO_LEADS;
  const raw = localStorage.getItem('omniscope_demo_leads');
  if (!raw) {
    localStorage.setItem('omniscope_demo_leads', JSON.stringify(INITIAL_DEMO_LEADS));
    return INITIAL_DEMO_LEADS;
  }
  try { return JSON.parse(raw); } catch { return INITIAL_DEMO_LEADS; }
}

function setStoredLeads(leads: any[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('omniscope_demo_leads', JSON.stringify(leads));
  }
}

function createDemoClient() {
  return {
    auth: {
      signInWithPassword: async () => ({ data: { user: { id: 'demo-admin-id' } }, error: null }),
      signOut: async () => {
        if (typeof window !== 'undefined') {
          document.cookie = 'omniscope_demo_role=; path=/; max-age=0';
        }
        return { error: null };
      },
      exchangeCodeForSession: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null })
    },
    from(table: string) {
      let targetId: string | null = null;
      let targetCol = 'id';
      let payload: any = null;

      const builder = {
        select: () => builder,
        order: () => builder,
        range: () => builder,
        limit: () => builder,
        neq: () => builder,
        gt: () => builder,
        gte: () => builder,
        lt: () => builder,
        lte: () => builder,
        like: () => builder,
        ilike: () => builder,
        is: () => builder,
        in: () => builder,
        contains: () => builder,
        containedBy: () => builder,
        upsert: () => builder,
        eq: (col: string, val: any) => {
          targetCol = col;
          targetId = val;
          return builder;
        },
        insert: (data: any) => {
          payload = Array.isArray(data) ? data[0] : data;
          if (table === 'leads') {
            const leads = getStoredLeads();
            const newLead = {
              id: 'lead-' + Date.now(),
              ...payload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            leads.unshift(newLead);
            setStoredLeads(leads);
          }
          return builder;
        },
        update: (data: any) => {
          payload = data;
          return builder;
        },
        delete: () => builder,
        single: async () => {
          if (table === 'profiles') {
            return { data: INITIAL_DEMO_PROFILES[0], error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (res: any) => void) => {
          if (table === 'leads') {
            let leads = getStoredLeads();
            if (payload && targetId) {
              // update
              leads = leads.map((l: any) => (l[targetCol] === targetId ? { ...l, ...payload, updated_at: new Date().toISOString() } : l));
              setStoredLeads(leads);
            } else if (!payload && targetId) {
              // delete
              leads = leads.filter((l: any) => l[targetCol] !== targetId);
              setStoredLeads(leads);
            }
            resolve({ data: leads, error: null });
            return;
          }
          if (table === 'profiles') {
            resolve({ data: INITIAL_DEMO_PROFILES, error: null });
            return;
          }
          if (table === 'activity_log') {
            resolve({ data: [], error: null });
            return;
          }
          resolve({ data: [], error: null });
        }
      };

      return builder;
    },
    channel: () => ({
      on: () => ({
        subscribe: () => ({})
      })
    }),
    removeChannel: () => {}
  } as any;
}

export function createClient() {
  if (isDemoMode()) {
    return createDemoClient();
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
