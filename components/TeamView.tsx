'use client';
import { formatMemberName, initials, isAttendedLead, normalizeStatusValue } from '@/lib/format';
import type { Lead, Profile } from '@/lib/types';

const IMAGE2_STATUSES = [
  { key: 'Attempted to Contact', label: 'Attempted to Contact', color: '#F59E0B', bg: '#FEF3C7', text: '#B45309' },
  { key: 'Contacted', label: 'Contacted', color: '#6366F1', bg: '#E0E7FF', text: '#4338CA' },
  { key: 'Demo Scheduled', label: 'Demo Scheduled', color: '#A855F7', bg: '#F3E8FF', text: '#6B21A8' },
  { key: 'Prospect (Meeting/Demo done)', label: 'Prospect (Meeting/Demo done)', color: '#EC4899', bg: '#FCE7F3', text: '#9D174D' },
  { key: 'Junk Lead', label: 'Junk Lead', color: '#94A3B8', bg: '#F1F5F9', text: '#64748B' },
  { key: 'Postponed', label: 'Postponed', color: '#F97316', bg: '#FED7AA', text: '#C2410C' },
  { key: 'Nurture', label: 'Nurture', color: '#EAB308', bg: '#FEF9C3', text: '#854D0E' },
  { key: 'Opportunity', label: 'Opportunity', color: '#22C55E', bg: '#DCFCE7', text: '#15803D' }
];

export default function TeamView({
  leads,
  people,
  onOpenMember
}: {
  leads: Lead[];
  people: Profile[];
  onOpenMember: (id: string, opts?: { attendedOnly?: boolean; status?: string }) => void;
}) {
  const owners = people.filter(p => (p.role === 'member' && p.active) || leads.some(l => l.owner_id === p.id));
  return (
    <>
      <div className="strip-head"><h2>Team performance</h2><span className="hint">Tap a member to see their leads</span></div>
      {owners.length === 0 && <div className="table-wrap"><div className="empty">No sales members yet. Invite them from the Members tab.</div></div>}
      <div className="team">
        {owners.map(m => {
          const name = formatMemberName(m);
          const ls = leads.filter(l => l.owner_id === m.id);
          const attended = ls.filter(isAttendedLead);
          const newCount = ls.filter(l => normalizeStatusValue(l.lead_status) === 'New').length;
          return (
            <div key={m.id} className="tm" onClick={() => onOpenMember(m.id, { attendedOnly: true })}>
              <div className="tm-head">
                <span className="avatar">{initials(name)}</span>
                <strong>{name}</strong>
                {!m.active && <span className="role-tag">Inactive</span>}
              </div>

              <div className="tm-lead-summary">
                <div
                  className="tm-lead-stat clickable"
                  title="Click to view all assigned leads"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMember(m.id, { attendedOnly: false });
                  }}
                >
                  <b>{ls.length}</b>
                  <span>Total Leads</span>
                </div>
                {newCount > 0 && (
                  <div
                    className="tm-lead-stat new-leads clickable"
                    title="Click to view New (uncontacted) leads"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMember(m.id, { status: 'New', attendedOnly: false });
                    }}
                  >
                    <b>{newCount}</b>
                    <span>New</span>
                  </div>
                )}
              </div>

              <div className="tm-status-grid">
                {IMAGE2_STATUSES.map(s => {
                  const count = ls.filter(l => normalizeStatusValue(l.lead_status) === s.key).length;
                  return (
                    <div
                      key={s.key}
                      className={`tm-status-card ${count > 0 ? 'active' : ''}`}
                      style={count > 0 ? { backgroundColor: s.bg, borderColor: `${s.color}50` } : {}}
                      title={`${s.key}: ${count} (Click to view)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenMember(m.id, { status: s.key, attendedOnly: true });
                      }}
                    >
                      <div className="tm-sc-top">
                        <span className="tm-sc-dot" style={{ background: s.color }} />
                        <b className="tm-sc-count" style={count > 0 ? { color: s.text } : {}}>{count}</b>
                      </div>
                      <span className="tm-sc-label" style={count > 0 ? { color: s.text } : {}}>{s.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mini" title="Lead status distribution">
                {[
                  { key: 'New', color: '#0EA5E9' },
                  ...IMAGE2_STATUSES
                ].map(s => {
                  const n = ls.filter(l => normalizeStatusValue(l.lead_status) === s.key).length;
                  return n ? <span key={s.key} style={{ flex: n, background: s.color }} title={`${s.key}: ${n}`} /> : null;
                })}
              </div>
              <div
                className="tm-foot"
                title="Click to view attended leads only"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMember(m.id, { attendedOnly: true });
                }}
              >
                <span className="tm-foot-text">
                  <b>{attended.length}</b> attended leads
                </span>
                <span className="tm-tap-link">• Tap to view</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
