'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Lead } from '@/lib/types';

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
        .range(from, from + PAGE - 1);
      if (error) { setError(error.message); setLoading(false); return; }
      all.push(...(data as Lead[]));
      if (!data || data.length < PAGE) break;
    }

    let metaMap: Record<string, any> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('sales_lead_metadata_cache_v1');
        if (raw) metaMap = JSON.parse(raw);
      } catch {}
    }

    const enriched = all.map(l => {
      const meta = metaMap[l.id] || metaMap[l.email?.toLowerCase()] || {};
      return {
        ...l,
        first_name: l.first_name || meta.firstName || meta.first_name || '',
        last_name: l.last_name || meta.lastName || meta.last_name || '',
        designation: l.designation || meta.designation || '',
        contact_no: l.contact_no || meta.contactNo || meta.contact_no || '',
        company: l.company || meta.company || ''
      };
    });

    setLeads(enriched);
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
