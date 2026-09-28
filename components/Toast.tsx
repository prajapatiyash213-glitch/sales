'use client';
import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2200);
  }, []);
  const node = <div className={`toast ${msg ? 'show' : ''}`} role="status" aria-live="polite">{msg}</div>;
  return { show, node };
}
