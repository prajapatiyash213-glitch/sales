import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function signOut(request: NextRequest, reason?: string | null) {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('YOUR-PROJECT');

  if (!isPlaceholder) {
    try {
      await createClient().auth.signOut();
    } catch {
      // ignore
    }
  }

  const url = new URL('/login', request.url);
  if (reason === 'inactive') url.searchParams.set('error', 'inactive');
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.delete('omniscope_demo_role');
  return response;
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

export async function GET(request: NextRequest) {
  return signOut(request, request.nextUrl.searchParams.get('reason'));
}
