'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { describeActivity, fmtDateTime } from '@/lib/format';
import type { Activity, Profile } from '@/lib/types';

const LIMIT = 200;

export default function ActivityView({ people }: { people: Profile[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState('all');
  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? 'Unknown';

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('lead_activity').select('*').order('created_at', { ascending: false }).limit(LIMIT);
    if (actor !== 'all') query = query.eq('actor_id', actor);
    const { data } = await query;
    setItems((data as Activity[]) ?? []);
    setLoading(false);
  }, [supabase, actor]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="strip-head">
        <h2>Activity log</h2>
        <span className="hint">Every add, edit, stage move and delete, newest first (last {LIMIT})</span>
      </div>
      <div className="toolbar">
        <select value={actor} onChange={e => setActor(e.target.value)} aria-label="Filter by person">
          <option value="all">Everyone</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </select>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      <div className="log">
        {loading ? <div className="empty">Loading activity…</div>
          : items.length === 0 ? <div className="empty">No activity yet. Changes to leads will appear here.</div>
          : items.map(a => (
            <div key={a.id} className="log-item">
              <time>{fmtDateTime(a.created_at)}</time>
              <div>
                <strong>{a.actor_name ?? 'System'}</strong> {a.action} <strong>{a.brand ?? 'a lead'}</strong>
                <div className="d">{describeActivity(a, nameOf)}</div>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
