'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${site}/account/set-password`
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="brand"><span className="brand-mark" />OmniScope</div>
        <h1>Reset your password</h1>
        {sent ? (
          <p>If an account exists for <strong>{email}</strong>, a reset link is on its way. Open it on this device to set a new password.</p>
        ) : (
          <>
            <p>Enter your work email and we will send you a link to set a new password.</p>
            {error && <div className="alert" role="alert">{error}</div>}
            <label className="f">Email
              <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <p className="demo-note"><Link href="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
