'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BRANDS, SOURCES, STAGES, STATUSES } from '@/lib/constants';
import { describeActivity, fmtDateTime, formatMemberName, normalizeStatusValue, today } from '@/lib/format';
import type { Activity, Lead, Profile } from '@/lib/types';

type Form = {
  email: string; company: string; brand: string; owner_id: string; lead_date: string; lead_source: string; lead_stage: string;
  connect_date: string; comments: string; followup2_date: string; followup2_comments: string; lead_status: string;
};

interface Props {
  open: boolean;
  lead: Lead | null;
  me: Profile;
  people: Profile[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(me: Profile, people: Profile[], isAdmin: boolean): Form {
  const firstMember = people.find(p => p.role === 'member' && p.active);
  return {
    email: '', company: '', brand: BRANDS[0], owner_id: isAdmin ? (firstMember?.id ?? me.id) : me.id,
    lead_date: today(), lead_source: SOURCES[0], lead_stage: 'Discovery',
    connect_date: '', comments: '', followup2_date: '', followup2_comments: '', lead_status: 'New'
  };
}

function fromLead(l: Lead): Form {
  return {
    email: l.email, company: l.company ?? '', brand: l.brand || BRANDS[0], owner_id: l.owner_id, lead_date: l.lead_date, lead_source: l.lead_source,
    lead_stage: l.lead_stage, connect_date: l.connect_date ?? '', comments: l.comments ?? '',
    followup2_date: l.followup2_date ?? '', followup2_comments: l.followup2_comments ?? '', lead_status: normalizeStatusValue(l.lead_status)
  };
}

export default function LeadEditor({ open, lead, me, people, isAdmin, onClose, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Form>(() => blank(me, people, isAdmin));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [dup, setDup] = useState<string | null>(null);
  const [dupAck, setDupAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<Activity[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);

  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? (id === me.id ? me.full_name : 'Unknown');

  useEffect(() => {
    if (!open) return;
    setF(lead ? fromLead(lead) : blank(me, people, isAdmin));
    setErrors({}); setDup(null); setDupAck(false); setSaveError(''); setHistory([]);
    const t = setTimeout(() => emailRef.current?.focus(), 60);
    if (lead) {
      supabase.from('lead_activity').select('*').eq('lead_id', lead.id)
        .order('created_at', { ascending: false }).limit(8)
        .then(({ data }: any) => setHistory((data as Activity[]) ?? []));
    }
    return () => clearTimeout(t);
    // Reset only when the drawer opens or a different lead is chosen —
    // not on background refreshes, so typing is never wiped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'lead_stage' && (v === 'Closed Won' || v === 'Client' || v === 'Won')) next.lead_status = 'Opportunity';
      if (k === 'lead_stage' && (v === 'Closed Lost' || v === 'Lost')) next.lead_status = 'Postponed';
      return next;
    });
    if (k === 'email') { setDup(null); setDupAck(false); }
  };

  async function save() {
    const e: typeof errors = {};
    const email = f.email.trim().toLowerCase();
    if (!email) e.email = 'Enter the lead\u2019s email.';
    else if (!EMAIL_RE.test(email)) e.email = 'This email looks incomplete. Check for a missing @ or domain.';
    if (!f.brand.trim()) e.brand = 'Select the brand.';
    if (!f.lead_date) e.lead_date = 'Pick the date the lead came in.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true); setSaveError('');

    if (!dupAck) {
      const { data } = await supabase.rpc('find_duplicate_lead', { p_email: email, p_exclude: lead?.id ?? null });
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit) {
        setDup(`${hit.brand} is owned by ${hit.owner_name} (stage: ${hit.lead_stage}). Press save again to add it anyway, or change the email.`);
        setDupAck(true);
        setBusy(false);
        return;
      }
    }

    const payload: any = {
      email,
      company: f.company.trim() || null,
      brand: f.brand.trim() || BRANDS[0],
      owner_id: isAdmin ? f.owner_id : me.id,
      lead_date: f.lead_date,
      lead_source: f.lead_source,
      lead_stage: f.lead_stage,
      connect_date: f.connect_date || null,
      comments: f.comments.trim() || null,
      followup2_date: f.followup2_date || null,
      followup2_comments: f.followup2_comments.trim() || null,
      lead_status: f.lead_status
    };

    let { error } = lead
      ? await supabase.from('leads').update(payload).eq('id', lead.id)
      : await supabase.from('leads').insert(payload);

    if (error && (error.code === 'PGRST204' || error.message?.includes('company'))) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.company;
      const retry = lead
        ? await supabase.from('leads').update(fallbackPayload).eq('id', lead.id)
        : await supabase.from('leads').insert(fallbackPayload);
      error = retry.error;
    }

    setBusy(false);
    if (error) {
      if (error.code === '23514' || error.message?.includes('check constraint')) {
        setSaveError(`Database constraint error: Run this command in Supabase SQL Editor to allow all stages/statuses:\nALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_stage_check;\nALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_status_check;`);
      } else {
        setSaveError(`Could not save: ${error.message}`);
      }
      return;
    }
    
    const isReallocation = lead && isAdmin && lead.owner_id !== f.owner_id;
    const newOwnerName = people.find(p => p.id === f.owner_id)?.full_name || 'sales member';
    const msg = lead
      ? (isReallocation ? `Lead allotted to ${newOwnerName}` : 'Changes saved')
      : 'Lead added';

    onSaved(msg);
    onClose();
  }

  async function remove() {
    if (!lead || !confirm(`Delete ${lead.company || lead.brand}? This removes the lead for everyone.`)) return;
    setBusy(true);
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    setBusy(false);
    if (error) { setSaveError(`Could not delete: ${error.message}`); return; }
    onSaved('Lead deleted');
    onClose();
  }

  const owners = people.filter(p => p.active || p.id === f.owner_id);

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} role="dialog" aria-labelledby="drTitle">
        <div className="dr-head">
          <h2 id="drTitle">{lead ? 'Edit lead' : 'Add lead'}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="dr-body" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
          {dup && <div className="warn show"><strong>This email is already in the pipeline.</strong> {dup}</div>}
          {saveError && <div className="alert" role="alert">{saveError}</div>}

          <fieldset className="fgroup">
            <legend>Lead details</legend>
            <label className="f">Email
              <input ref={emailRef} type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" />
              {errors.email && <span className="err">{errors.email}</span>}
            </label>
            <div className="grid2">
              <label className="f">Company Name
                <input type="text" value={f.company} onChange={e => set('company', e.target.value)} placeholder="e.g. Acme Corp" />
              </label>
              <label className="f">Brand
                <select value={f.brand} onChange={e => set('brand', e.target.value)}>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  {!BRANDS.includes(f.brand) && f.brand && <option value={f.brand}>{f.brand}</option>}
                </select>
                {errors.brand && <span className="err">{errors.brand}</span>}
              </label>
            </div>
            <div className="grid2">
              <label className="f">Ownership
                <select value={f.owner_id} disabled={!isAdmin} onChange={e => set('owner_id', e.target.value)}>
                  {(isAdmin ? owners : [me]).map(p => (
                    <option key={p.id} value={p.id}>{formatMemberName(p)}</option>
                  ))}
                </select>
              </label>
              <label className="f">Lead Date
                <input type="date" value={f.lead_date} onChange={e => set('lead_date', e.target.value)} />
                {errors.lead_date && <span className="err">{errors.lead_date}</span>}
              </label>
            </div>
            <div className="grid2">
              <label className="f">Lead Source
                <select value={f.lead_source} onChange={e => set('lead_source', e.target.value)}>
                  {[...new Set([...SOURCES, f.lead_source])].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="f">Lead Stage
                <select value={f.lead_stage} onChange={e => set('lead_stage', e.target.value)}>
                  {STAGES.map(s => <option key={s.key}>{s.key}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="fgroup">
            <legend>First connect</legend>
            <label className="f">Date of Connect
              <input type="date" value={f.connect_date} onChange={e => set('connect_date', e.target.value)} />
            </label>
            <label className="f">Comments
              <textarea value={f.comments} onChange={e => set('comments', e.target.value)} placeholder="What was discussed on the first call or meeting" />
            </label>
          </fieldset>

          <fieldset className="fgroup">
            <legend>Follow-up 2</legend>
            <label className="f">Follow-up 2 Date
              <input type="date" value={f.followup2_date} onChange={e => set('followup2_date', e.target.value)} />
            </label>
            <label className="f">Comments
              <textarea value={f.followup2_comments} onChange={e => set('followup2_comments', e.target.value)} placeholder="Notes from the second follow-up" />
            </label>
          </fieldset>

          <fieldset className="fgroup">
            <legend>Outcome</legend>
            <label className="f">Lead Status
              <select value={f.lead_status} onChange={e => set('lead_status', e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </fieldset>

          {lead && (
            <div className="history">
              <strong>Recent changes</strong>
              {history.length ? (
                <ul>{history.map(h => (
                  <li key={h.id}>{h.actor_name ?? 'Someone'}: {describeActivity(h, nameOf)} <span>({fmtDateTime(h.created_at)})</span></li>
                ))}</ul>
              ) : <div>No changes recorded yet.</div>}
            </div>
          )}
          <button type="submit" hidden />
        </form>
        <div className="dr-foot">
          {lead && isAdmin
            ? <button className="btn danger" type="button" onClick={remove} disabled={busy}>Delete lead</button>
            : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="button" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
