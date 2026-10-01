'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Fallback for links that arrive with ?code= (default Supabase email templates)
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      createClient().auth.exchangeCodeForSession(code).then(({ error }: any) => {
        if (error) setError('This link has expired. Ask for a new one from the sign-in page.');
        window.history.replaceState(null, '', '/account/set-password');
      });
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="brand"><span className="brand-mark" />Tecnoprism Sales</div>
        <h1>Set your password</h1>
        <p>Choose a password you will use to sign in from now on.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <label className="f">New password
          <input type="password" autoComplete="new-password" required value={pw} onChange={e => setPw(e.target.value)} />
        </label>
        <label className="f">Confirm password
          <input type="password" autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}
