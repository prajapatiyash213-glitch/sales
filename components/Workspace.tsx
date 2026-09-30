'use client';
import { useMemo, useState, type DragEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COMPANIES, SOURCES, STAGES, STATUSES } from '@/lib/constants';
import { downloadLeadsCsv, fmtDate, initials, isOverdue, stageColor, today } from '@/lib/format';
import type { Lead, Profile } from '@/lib/types';
import LeadEditor from './LeadEditor';
import ImportModal from './ImportModal';
import { useToast } from './Toast';

interface Props {
  leads: Lead[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  me: Profile;
  people: Profile[];
  isAdmin: boolean;
  initialOwner?: string;
}

function StagePill({ stage }: { stage: string }) {
  return <span className="pill"><span className="dot" style={{ background: stageColor(stage) }} />{stage}</span>;
}
function statusClass(st: string): string {
  const clean = (st || '').toLowerCase();
  if (clean.includes('new')) return 'st-New';
  if (clean.includes('attempt')) return 'st-Attempted';
  if (clean.includes('contact')) return 'st-Contacted';
  if (clean.includes('demo')) return 'st-Demo';
  if (clean.includes('prospect')) return 'st-Prospect';
  if (clean.includes('junk')) return 'st-Junk';
  if (clean.includes('closed lost') || clean.includes('lost')) return 'st-ClosedLost';
  if (clean.includes('nurture')) return 'st-Nurture';
  if (clean.includes('opportunity')) return 'st-Opportunity';
  if (clean.includes('hot')) return 'st-Hot';
  if (clean.includes('warm')) return 'st-Warm';
  if (clean.includes('cold')) return 'st-Cold';
  if (clean.includes('converted') || clean.includes('won')) return 'st-Converted';
  return 'st-Warm';
}
function StatusPill({ status }: { status: string }) {
  return <span className={`status ${statusClass(status)}`}>{status}</span>;
}

export default function Workspace({ leads, loading, error, reload, me, people, isAdmin, initialOwner }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [view, setView] = useState<'table' | 'board'>('table');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState(initialOwner ?? 'all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [stage, setStage] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [importOpen, setImportOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const p = people.find(item => item.id === id) ?? (id === me.id ? me : null);
    if (!p) return 'Unknown';
    if (p.full_name && p.full_name !== 'Sales Member') return p.full_name;
    if (p.email) {
      const handle = p.email.split('@')[0];
      return handle.split(/[\._]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    }
    return p.full_name || 'Member';
  };
  const members = people.filter(p => p.role === 'member' || leads.some(l => l.owner_id === p.id));

  // Leads scoped by owner filter (Sales members see their own leads; Admins see all or filtered owner)
  const scoped = useMemo(() => {
    if (!isAdmin) {
      return leads.filter(l => l.owner_id === me.id);
    }
    return leads.filter(l => owner === 'all' || l.owner_id === owner);
  }, [leads, owner, isAdmin, me.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped.filter(l =>
      (!stage || l.lead_stage === stage) &&
      (brandFilter === 'all' || l.brand === brandFilter) &&
      (source === 'all' || l.lead_source === source) &&
      (status === 'all' || l.lead_status === status) &&
      (!overdueOnly || isOverdue(l)) &&
      (!needle || [l.email, l.brand, l.comments, l.followup2_comments].join(' ').toLowerCase().includes(needle))
    );
  }, [scoped, stage, brandFilter, source, status, overdueOnly, q]);

  const overdueCount = scoped.filter(isOverdue).length;
  const inProgressCount = scoped.filter(l => ['Qualified', 'Opportunity', 'Pilot/POC', 'Proposal', 'Value Negotiation', 'Contacted', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation'].includes(l.lead_stage)).length;
  const wonCount = scoped.filter(l => ['Closed Won', 'Client', 'Won'].includes(l.lead_stage)).length;
  const activeCount = scoped.filter(l => !['Closed Lost', 'Lost'].includes(l.lead_stage) && !['Junk Lead', 'Closed Lost', 'Dropped'].includes(l.lead_status)).length;
  const winRate = scoped.length ? Math.round((wonCount / scoped.length) * 100) : 0;
  const sources = [...new Set([...SOURCES, ...leads.map(l => l.lead_source)])];

  async function moveStage(id: string, newStage: string) {
    const lead = leads.find(l => l.id === id);
    if (!lead || lead.lead_stage === newStage) return;
    const { error } = await supabase.from('leads').update({ lead_stage: newStage }).eq('id', id);
    if (error) toast.show(`Could not move lead: ${error.message}`);
    else { toast.show(`Moved to ${newStage}`); reload(); }
  }

  const openLead = (lead: Lead | null) => setEditor({ open: true, lead });

  const title = isAdmin ? (owner === 'all' ? 'Whole team pipeline' : `${nameOf(owner)}\u2019s pipeline`) : 'My pipeline';

  return (
    <>
      <div className="metric-cards">
        <div className="mcard mcard-pink">
          <div className="mcard-top">
            <span className="mcard-tag">PIPELINE STATUS</span>
            <span className="mcard-badge">Total Pipeline</span>
          </div>
          <div className="mcard-val">{scoped.length}</div>
          <div className="mcard-sub">{activeCount} Active Leads</div>
        </div>
        <div className="mcard mcard-purple">
          <div className="mcard-top">
            <span className="mcard-tag">IN PROGRESS</span>
            <span className="mcard-badge">Active Stages</span>
          </div>
          <div className="mcard-val">{inProgressCount}</div>
          <div className="mcard-sub">Meeting & Proposals</div>
        </div>
        <div className="mcard mcard-blue">
          <div className="mcard-top">
            <span className="mcard-tag">CLOSED WON</span>
            <span className="mcard-badge">Conversion</span>
          </div>
          <div className="mcard-val">{wonCount}</div>
          <div className="mcard-sub">{winRate}% Win Rate</div>
        </div>
        <div className="mcard mcard-orange">
          <div className="mcard-top">
            <span className="mcard-tag">FOLLOW-UPS OVERDUE</span>
            <span className="mcard-badge">Alerts</span>
          </div>
          <div className="mcard-val">{overdueCount}</div>
          <div className="mcard-sub">Action Required</div>
        </div>
      </div>

      <div className="strip-head">
        <h2>{title} <span className="count">({scoped.length})</span></h2>
        <span className="hint">
          {view === 'board' ? 'Drag a card to move it to another stage'
            : stage ? <>Showing {stage} only. <button className="linkish" onClick={() => setStage(null)}>Show all stages</button></>
            : 'Tap a stage to filter the list'}
        </span>
      </div>

      <div className={`strip ${stage && view === 'table' ? 'filtered' : ''}`}>
        {STAGES.map(s => {
          const n = scoped.filter(l => l.lead_stage === s.key).length;
          return (
            <button key={s.key} className={`seg ${stage === s.key ? 'on' : ''}`}
              style={{ background: s.color, flexGrow: Math.max(n, 0.6) }}
              aria-label={`${s.key}: ${n} leads`} aria-pressed={stage === s.key}
              onClick={() => { if (view === 'table') setStage(stage === s.key ? null : s.key); }}>
              <b>{n}</b><span>{s.key}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="seg-toggle" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>List</button>
          <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
        </div>
        <input type="search" placeholder="Search email, company or comments" value={q} onChange={e => setQ(e.target.value)} aria-label="Search leads" />
        {isAdmin && (
          <select value={owner} onChange={e => setOwner(e.target.value)} aria-label="Filter by owner">
            <option value="all">All members</option>
            {members.map(m => <option key={m.id} value={m.id}>{nameOf(m.id)}</option>)}
          </select>
        )}
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} aria-label="Filter by brand">
          <option value="all">All brands</option>
          {COMPANIES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} aria-label="Filter by source">
          <option value="all">All sources</option>
          {sources.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className={`btn ${overdueOnly ? 'on-danger' : ''}`} onClick={() => setOverdueOnly(v => !v)} aria-pressed={overdueOnly}>
          Overdue follow-ups ({overdueCount})
        </button>
        <button className="btn" onClick={() => downloadLeadsCsv(filtered, people.length ? people : [me], `leads-${today()}.csv`)}>Export CSV</button>
        {isAdmin && <button className="btn" onClick={() => setImportOpen(true)}>📥 Import Excel / CSV</button>}
        <button className="btn primary" onClick={() => openLead(null)}>+ Add lead</button>
      </div>

      {error && <div className="alert" role="alert">Could not load leads: {error} <button className="linkish" onClick={() => reload()}>Try again</button></div>}

      {loading ? (
        <div className="table-wrap"><div className="empty">Loading leads…</div></div>
      ) : view === 'table' ? (
        filtered.length === 0 ? (
          <div className="table-wrap"><div className="empty">
            {scoped.length ? 'No leads match these filters. Clear the search or pick another stage.' : 'No leads yet. Add your first lead to start the pipeline.'}
            <br /><button className="btn primary" onClick={() => openLead(null)}>+ Add lead</button>
          </div></div>
        ) : (
          <>
            <div className="table-wrap leads">
              <table>
                <thead><tr>
                  <th>Email</th><th>Company</th><th>Ownership</th><th>Lead Date</th><th>Lead Source</th><th>Lead Stage</th>
                  <th>Date of Connect</th><th>Comments</th><th>Follow-up 2 Date</th><th>Comments</th><th>Lead Status</th>
                </tr></thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} tabIndex={0} onClick={() => openLead(l)} onKeyDown={e => { if (e.key === 'Enter') openLead(l); }}>
                      <td>{l.email}</td>
                      <td><strong>{l.brand}</strong></td>
                      <td>
                        {isAdmin ? (
                          <select
                            value={l.owner_id}
                            onClick={e => e.stopPropagation()}
                            onChange={async (e) => {
                              e.stopPropagation();
                              const newOwnerId = e.target.value;
                              if (newOwnerId === l.owner_id) return;
                              const newName = nameOf(newOwnerId);
                              const { error } = await supabase.from('leads').update({ owner_id: newOwnerId }).eq('id', l.id);
                              if (error) {
                                toast.show(`Could not reallocate lead: ${error.message}`);
                              } else {
                                toast.show(`Lead allotted to ${newName}`);
                                reload();
                              }
                            }}
                            className="owner-select"
                            title="Change lead ownership"
                          >
                            {people.filter(p => p.active || p.id === l.owner_id).map(m => (
                              <option key={m.id} value={m.id}>{nameOf(m.id)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="owner"><span className="avatar">{initials(nameOf(l.owner_id))}</span>{nameOf(l.owner_id)}</span>
                        )}
                      </td>
                      <td>{fmtDate(l.lead_date)}</td>
                      <td>{l.lead_source}</td>
                      <td><StagePill stage={l.lead_stage} /></td>
                      <td>{fmtDate(l.connect_date)}</td>
                      <td className="cm"><div title={l.comments ?? ''}>{l.comments || '—'}</div></td>
                      <td><FollowUp l={l} /></td>
                      <td className="cm"><div title={l.followup2_comments ?? ''}>{l.followup2_comments || '—'}</div></td>
                      <td><StatusPill status={l.lead_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cards">
              {filtered.map(l => (
                <button key={l.id} className="card" onClick={() => openLead(l)}>
                  <div className="card-top">
                    <div><h3>{l.brand}</h3><div className="em">{l.email}</div></div>
                    <StatusPill status={l.lead_status} />
                  </div>
                  <dl>
                    <dt>Stage</dt><dd><StagePill stage={l.lead_stage} /></dd>
                    <dt>Owner</dt><dd>{nameOf(l.owner_id)}</dd>
                    <dt>Source</dt><dd>{l.lead_source}</dd>
                    <dt>Lead date</dt><dd>{fmtDate(l.lead_date)}</dd>
                    <dt>Follow-up 2</dt><dd><FollowUp l={l} /></dd>
                  </dl>
                </button>
              ))}
            </div>
          </>
        )
      ) : (
        <div className="board">
          {STAGES.map(s => {
            const items = filtered.filter(l => l.lead_stage === s.key);
            return (
              <div key={s.key} className={`col ${dragOver === s.key ? 'over' : ''}`}
                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOver(s.key); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e: DragEvent) => { e.preventDefault(); setDragOver(null); moveStage(e.dataTransfer.getData('text/plain'), s.key); }}>
                <h4><StagePill stage={s.key} /><em>{items.length}</em></h4>
                {items.map(l => (
                  <div key={l.id} className="bcard" draggable tabIndex={0}
                    onDragStart={e => e.dataTransfer.setData('text/plain', l.id)}
                    onClick={() => openLead(l)} onKeyDown={e => { if (e.key === 'Enter') openLead(l); }}>
                    <strong>{l.brand}</strong>
                    <span className="muted">{l.email}</span>
                    <div className="meta"><span>{isAdmin ? nameOf(l.owner_id) : l.lead_source}</span><StatusPill status={l.lead_status} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <LeadEditor
        open={editor.open}
        lead={editor.lead}
        me={me}
        people={isAdmin ? people : [me]}
        isAdmin={isAdmin}
        onClose={() => setEditor(e => ({ ...e, open: false }))}
        onSaved={msg => { toast.show(msg); reload(); }}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        me={me}
        people={people}
        reload={reload}
      />
      {toast.node}
    </>
  );
}

function FollowUp({ l }: { l: Lead }) {
  if (!l.followup2_date) return <>—</>;
  const od = isOverdue(l);
  return <span className={od ? 'overdue' : ''}>{fmtDate(l.followup2_date)}{od ? ' (overdue)' : ''}</span>;
}
