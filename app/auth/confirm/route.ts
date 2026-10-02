import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/format';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  const supabase = createClient();

  // PKCE Code Flow
  if (code) {
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const redirectUrl = new URL(`${origin}${next}`);
      if (data.user.email) redirectUrl.searchParams.set('email', data.user.email);
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Token Hash OTP Flow (Invite / Recovery / Signup / Magiclink)
  if (token_hash) {
    await supabase.auth.signOut();

    const typesToTry: EmailOtpType[] = Array.from(new Set(
      [type, 'invite', 'recovery', 'magiclink', 'signup', 'email'].filter(Boolean) as EmailOtpType[]
    ));

    for (const t of typesToTry) {
      const { data, error } = await supabase.auth.verifyOtp({ type: t, token_hash });
      if (!error && data?.user) {
        const redirectUrl = new URL(`${origin}${next}`);
        if (data.user.email) redirectUrl.searchParams.set('email', data.user.email);
        return NextResponse.redirect(redirectUrl.toString());
      }
    }
  }

  // If Supabase auth/v1/verify already verified the token and redirected to /auth/confirm?next=...,
  // pass the user through to the target page (e.g. /account/set-password)
  if (next && next !== '/login') {
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
