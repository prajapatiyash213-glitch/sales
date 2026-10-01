import { STAGES, STATUSES, FIELD_LABELS } from './constants';
import type { Activity, Lead, Profile } from './types';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function extractCompanyFromEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '';
  const domain = email.split('@')[1] || '';
  const namePart = domain.split('.')[0] || '';
  if (!namePart || ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'proton', 'aol', 'zoho', 'rediffmail'].includes(namePart.toLowerCase())) {
    return '';
  }
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

export function displayCompany(l: { company?: string | null; email?: string }): string {
  if (l.company && l.company.trim()) return l.company.trim();
  const derived = extractCompanyFromEmail(l.email);
  return derived || '—';
}

export function normalizeStatusValue(status: string | null | undefined): string {
  if (!status) return 'New';
  if (STATUSES.includes(status)) return status;
  const clean = status.trim().toLowerCase();
  if (clean === 'warm' || clean === 'cold') return 'New';
  if (clean === 'hot' || clean === 'converted') return 'Opportunity';
  if (clean === 'dropped' || clean === 'closed lost') return 'Postponed';
  return 'New';
}

export function normalizeStageValue(stage: string | null | undefined): string {
  if (!stage) return 'Discovery';
  const validKeys = STAGES.map(s => s.key);
  if (validKeys.includes(stage)) return stage;
  const clean = stage.trim().toLowerCase();
  if (clean === 'new' || clean.includes('disco')) return 'Discovery';
  if (clean === 'contacted' || clean.includes('meeting') || clean.includes('quali')) return 'Qualified';
  if (clean.includes('opport')) return 'Opportunity';
  if (clean.includes('pilot') || clean.includes('poc')) return 'Pilot/POC';
  if (clean.includes('proposal sent') || clean.includes('propos')) return 'Proposal';
  if (clean === 'negotiation' || clean.includes('nego') || clean.includes('value')) return 'Value Negotiation';
  if (clean === 'lost' || clean.includes('closed lost')) return 'Closed Lost';
  if (clean === 'won' || clean.includes('closed won')) return 'Closed Won';
  if (clean.includes('client') || clean.includes('customer')) return 'Client';
  return 'Discovery';
}

export function today(): string {
  // local date in YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA');
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${dd} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  return (name || '?').split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function stageColor(stage: string): string {
  const norm = normalizeStageValue(stage);
  return STAGES.find(s => s.key === norm)?.color ?? 'var(--muted)';
}

export function isOverdue(l: Lead): boolean {
  const normStatus = normalizeStatusValue(l.lead_status);
  return !!l.followup2_date && l.followup2_date < today() && !['Opportunity', 'Postponed', 'Junk Lead'].includes(normStatus);
}

export function describeActivity(a: Activity, nameOf: (id: string) => string): string {
  if (a.action === 'created') return 'Added the lead';
  if (a.action === 'deleted') return 'Deleted the lead';
  if (!a.changes) return 'Updated the lead';
  return Object.entries(a.changes)
    .filter(([k]) => FIELD_LABELS[k])
    .map(([k, v]) => {
      if (k === 'comments' || k === 'followup2_comments') return `${FIELD_LABELS[k]} updated`;
      const show = (x: unknown) => {
        if (x === null || x === undefined || x === '') return 'empty';
        if (k === 'owner_id') return nameOf(String(x));
        if (k.endsWith('_date')) return fmtDate(String(x));
        return String(x);
      };
      return `${FIELD_LABELS[k]}: ${show(v.from)} → ${show(v.to)}`;
    })
    .join('; ') || 'Updated the lead';
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // guard against spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const GENERIC_NAMES = ['sales', 'sales member', 'member', 'admin', 'user', 'test admin', 'sales person', 'sales@omniscope.com', 'sales@tecnoprism.com'];

export function formatMemberName(p?: Profile | null, fallback?: string): string {
  if (!p) return fallback ?? 'Unknown';
  const name = p.full_name?.trim();
  if (name && !GENERIC_NAMES.includes(name.toLowerCase())) {
    return name;
  }
  if (p.email && p.email.toLowerCase() !== 'sales@omniscope.com' && p.email.toLowerCase() !== 'sales@tecnoprism.com') {
    const handle = p.email.split('@')[0];
    const formatted = handle
      .split(/[\._]/)
      .filter(Boolean)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
    if (!GENERIC_NAMES.includes(formatted.toLowerCase())) {
      return formatted;
    }
  }
  return fallback || 'Team Member';
}

export function downloadLeadsCsv(leads: Lead[], people: Profile[], filename = 'leads.csv') {
  const nameOf = (id: string) => formatMemberName(people.find(p => p.id === id));
  const header = ['Email','Company','Brand','Ownership','Lead Date','Lead Source','Lead Stage','Date of Connect','Comments','Follow-up 2 Date','Comments','Lead Status'];
  const rows = leads.map(l => [
    l.email, displayCompany(l) === '—' ? '' : displayCompany(l), l.brand, nameOf(l.owner_id), l.lead_date, l.lead_source, l.lead_stage,
    l.connect_date, l.comments, l.followup2_date, l.followup2_comments, l.lead_status
  ]);
  const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
