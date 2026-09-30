// Edit these lists to match your sales process.
// NOTE: stages and statuses are also enforced in supabase/schema.sql —
// if you rename them here, update the CHECK constraints there too.

export const STAGES: { key: string; color: string }[] = [
  { key: 'Discovery', color: 'var(--s-discovery)' },
  { key: 'Qualified', color: 'var(--s-qualified)' },
  { key: 'Opportunity', color: 'var(--s-opportunity)' },
  { key: 'Pilot/POC', color: 'var(--s-pilot)' },
  { key: 'Proposal', color: 'var(--s-proposal)' },
  { key: 'Value Negotiation', color: 'var(--s-nego)' },
  { key: 'Closed Lost', color: 'var(--s-lost)' },
  { key: 'Closed Won', color: 'var(--s-won)' },
  { key: 'Client', color: 'var(--s-client)' }
];

export const STATUSES = [
  'New',
  'Attempted to Contact',
  'Contacted',
  'Demo Scheduled',
  'Prospect (Meeting/Demo done)',
  'Junk Lead',
  'Closed Lost',
  'Nurture',
  'Opportunity'
];

export const SOURCES = [
  'Inbound - Referral',
  'Inbound - Forms',
  'Inbound - Visitors',
  'Outbound - Cold',
  'Inbound - Drop-Offs',
  'Events - Imagine',
  'Events - CFO'
];

export const COMPANIES = [
  'ACOE',
  'Tecnoprism'
];
export const BRANDS = COMPANIES;

export const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  brand: 'Company',
  owner_id: 'Ownership',
  lead_date: 'Lead Date',
  lead_source: 'Lead Source',
  lead_stage: 'Lead Stage',
  connect_date: 'Date of Connect',
  comments: 'Comments',
  followup2_date: 'Follow-up 2 Date',
  followup2_comments: 'Follow-up 2 Comments',
  lead_status: 'Lead Status'
};
