import { STAGES, FIELD_LABELS } from './constants';
import type { Activity, Lead, Profile } from './types';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  return STAGES.find(s => s.key === stage)?.color ?? 'var(--muted)';
}

export function isOverdue(l: Lead): boolean {
  return !!l.followup2_date && l.followup2_date < today() && !['Converted', 'Dropped'].includes(l.lead_status);
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

export function downloadLeadsCsv(leads: Lead[], people: Profile[], filename = 'leads.csv') {
  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? '';
  const header = ['Email','Brand','Ownership','Lead Date','Lead Source','Lead Stage','Date of Connect','Comments','Follow-up 2 Date','Comments','Lead Status'];
  const rows = leads.map(l => [
    l.email, l.brand, nameOf(l.owner_id), l.lead_date, l.lead_source, l.lead_stage,
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
