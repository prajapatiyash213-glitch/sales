// Edit these lists to match your sales process.
// NOTE: stages and statuses are also enforced in supabase/schema.sql —
// if you rename them here, update the CHECK constraints there too.

export const STAGES: { key: string; color: string }[] = [
  { key: 'New', color: 'var(--s-new)' },
  { key: 'Contacted', color: 'var(--s-contacted)' },
  { key: 'Meeting Scheduled', color: 'var(--s-meeting)' },
  { key: 'Proposal Sent', color: 'var(--s-proposal)' },
  { key: 'Negotiation', color: 'var(--s-nego)' },
  { key: 'Won', color: 'var(--s-won)' },
  { key: 'Lost', color: 'var(--s-lost)' }
];

export const STATUSES = ['Hot', 'Warm', 'Cold', 'Converted', 'Dropped'];

export const SOURCES = [
  'Website: tecnoprism.com',
  'Website: automationcoe.com',
  'Event',
  'LinkedIn',
  'Referral',
  'Email campaign',
  'Cold outreach'
];

export const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  brand: 'Brand',
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
