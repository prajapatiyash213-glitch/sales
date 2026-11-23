'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Lead } from '@/lib/types';
import { enrichLeadRecord, isValidContactNo } from '@/lib/metaHelper';

const PAGE = 1000;

export function useLeads() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    // RLS decides what comes back: members get their own leads, admins get all.
    const all: Lead[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('lead_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { setError(error.message); setLoading(false); return; }
      all.push(...(data as Lead[]));
      if (!data || data.length < PAGE) break;
    }

    let metaMap: Record<string, any> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('sales_lead_metadata_cache_v1');
        if (raw) {
          metaMap = JSON.parse(raw);
          let dirty = false;
          for (const key of Object.keys(metaMap)) {
            if (metaMap[key]?.contactNo && !isValidContactNo(metaMap[key].contactNo)) {
              delete metaMap[key].contactNo;
              dirty = true;
            }
            if (metaMap[key]?.contact_no && !isValidContactNo(metaMap[key].contact_no)) {
              delete metaMap[key].contact_no;
              dirty = true;
            }
          }
          if (dirty) {
            localStorage.setItem('sales_lead_metadata_cache_v1', JSON.stringify(metaMap));
          }
        }
      } catch {}
    }

    const enriched = all.map(l => enrichLeadRecord(l, metaMap));

    setLeads(prev => {
      if (prev.length === 0) return enriched;
      const newMap = new Map(enriched.map(l => [l.id, l]));
      // Keep existing leads in their EXACT current table position, updated with new data
      const updated = prev.map(p => newMap.get(p.id) || p);
      // Prepend any brand-new leads created
      const prevIds = new Set(prev.map(p => p.id));
      const brandNew = enriched.filter(l => !prevIds.has(l.id));
      return [...brandNew, ...updated];
    });
    setError(null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();

    const interval = setInterval(reload, 4000);

    const channel = supabase
      .channel('leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(reload, 300);
      })
      .subscribe();
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [supabase, reload]);

  return { leads, loading, error, reload };
}
