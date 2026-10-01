'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeNext } from '@/lib/format';

export default function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const trimmedEmail = email.trim().toLowerCase();

    try {
      const { error } = await createClient().auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        setError(error.message || 'Invalid email or password.');
        setBusy(false);
        return;
      }
      router.replace(safeNext(next));
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not sign in. Please check your internet connection.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </span>
          Tecnoprism Sales
        </div>
        <h1>Sign in</h1>
        {error && <div className="alert" role="alert">{error}</div>}
        <label className="f">Email
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
        </label>
        <label className="f">Password
          <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="demo-note"><Link href="/forgot-password">Forgot your password?</Link></p>
      </form>
    </div>
  );
}
