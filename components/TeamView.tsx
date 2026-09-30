'use client';
import { STAGES } from '@/lib/constants';
import { formatMemberName, initials, isOverdue } from '@/lib/format';
import type { Lead, Profile } from '@/lib/types';

export default function TeamView({ leads, people, onOpenMember }: { leads: Lead[]; people: Profile[]; onOpenMember: (id: string) => void }) {
  const owners = people.filter(p => (p.role === 'member' && p.active) || leads.some(l => l.owner_id === p.id));
  return (
    <>
      <div className="strip-head"><h2>Team performance</h2><span className="hint">Tap a member to see their leads</span></div>
      {owners.length === 0 && <div className="table-wrap"><div className="empty">No sales members yet. Invite them from the Members tab.</div></div>}
      <div className="team">
        {owners.map(m => {
          const name = formatMemberName(m);
          const ls = leads.filter(l => l.owner_id === m.id);
          const won = ls.filter(l => l.lead_stage === 'Won').length;
          const hot = ls.filter(l => l.lead_status === 'Hot').length;
          const od = ls.filter(isOverdue).length;
          const closed = ls.filter(l => l.lead_stage === 'Won' || l.lead_stage === 'Lost').length;
          const winRate = closed ? Math.round((won / closed) * 100) : null;
          return (
            <button key={m.id} className="tm" onClick={() => onOpenMember(m.id)}>
              <div className="tm-head">
                <span className="avatar">{initials(name)}</span>
                <strong>{name}</strong>
                {!m.active && <span className="role-tag">Inactive</span>}
              </div>
              <div className="tm-nums">
                <div><b>{ls.length}</b>Leads</div>
                <div><b>{won}</b>Won</div>
                <div><b>{hot}</b>Hot</div>
                <div><b className={od ? 'overdue' : ''}>{od}</b>Overdue</div>
              </div>
              <div className="mini">
                {STAGES.map(s => {
                  const n = ls.filter(l => l.lead_stage === s.key).length;
                  return n ? <span key={s.key} style={{ flex: n, background: s.color }} title={`${s.key}: ${n}`} /> : null;
                })}
              </div>
              <div className="tm-foot">{winRate === null ? 'No closed deals yet' : `Win rate ${winRate}% of closed deals`}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
