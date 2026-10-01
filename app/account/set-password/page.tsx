'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function initSession() {
      try {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const code = params.get('code');
        const tokenHash = params.get('token_hash');
        const type = (params.get('type') as any) || 'invite';

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError('This invitation link has expired or was already used. Please request a new invite.');
            setChecking(false);
            return;
          }
          window.history.replaceState(null, '', '/account/set-password');
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) {
            setError('This invitation link has expired or was already used. Please request a new invite.');
            setChecking(false);
            return;
          }
          window.history.replaceState(null, '', '/account/set-password');
        }

        // Check active session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (session.user?.email) setEmail(session.user.email);
          setHasSession(true);
          setChecking(false);
          return;
        }

        // Listen for auth state change in case Supabase client is processing access_token in URL hash
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
          if (session) {
            if (session.user?.email) setEmail(session.user.email);
            setHasSession(true);
            setError('');
            setChecking(false);
          }
        });

        // Small delay to allow hash parsing or session storage hydration
        const timer = setTimeout(async () => {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s) {
            if (s.user?.email) setEmail(s.user.email);
            setHasSession(true);
          } else if (!code && !tokenHash) {
            setError('No active invite session found. Please open the link directly from your invitation email.');
          }
          setChecking(false);
        }, 600);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timer);
        };
      } catch (err: any) {
        setError(err?.message || 'Could not verify invitation session.');
        setChecking(false);
      }
    }

    initSession();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setBusy(false);
      setHasSession(false);
      return setError('Auth session missing or expired. Please click the invitation link in your email again.');
    }

    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }

    // Seamlessly navigate to dashboard
    window.location.href = '/';
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="brand"><span className="brand-mark" />Tecnoprism Sales</div>
        <h1>Set your password</h1>
        <p>Choose a password you will use to sign in from now on.</p>

        {error && <div className="alert" role="alert">{error}</div>}

        {checking ? (
          <p style={{ textAlign: 'center', color: '#666', margin: '20px 0' }}>Verifying your invitation link…</p>
        ) : !hasSession ? (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Link href="/login" className="btn primary block" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            {email && (
              <label className="f">Email address
                <input type="email" value={email} disabled readOnly style={{ opacity: 0.8, cursor: 'not-allowed', backgroundColor: '#f5f5f7' }} />
              </label>
            )}
            <label className="f">New password
              <input type="password" autoComplete="new-password" required value={pw} onChange={e => setPw(e.target.value)} placeholder="Minimum 8 characters" />
            </label>
            <label className="f">Confirm password
              <input type="password" autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Re-enter new password" />
            </label>
            <button className="btn primary block" disabled={busy}>{busy ? 'Saving & signing in…' : 'Save password & open dashboard'}</button>
          </>
        )}
      </form>
    </div>
  );
}
