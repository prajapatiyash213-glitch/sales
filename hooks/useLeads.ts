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
    setLeads(all);
    setError(null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
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
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [supabase, reload]);

  return { leads, loading, error, reload };
}
