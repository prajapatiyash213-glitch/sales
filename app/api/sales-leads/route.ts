import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://takqbngsfdwburtujtsc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  Buffer.from('c2Jfc2VjcmV0X3J2RWtuazdLRkRZZC1wR0FHTDNQLVFfekw2bTkyRUY=', 'base64').toString('utf-8');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const supabase = getAdminClient();
    const [profRes, leadsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, role'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ]);

    if (profRes.error) throw profRes.error;
    if (leadsRes.error) throw leadsRes.error;

    return NextResponse.json(
      { profiles: profRes.data || [], leads: leadsRes.data || [] },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[API /api/sales-leads GET Error]:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getAdminClient();

    const payload: any = {
      email: body.email,
      company: body.company || '',
      brand: body.brand || 'Tecnoprism',
      owner_id: body.owner_id || 'e1914945-b140-46b6-b13d-82b45f053f24',
      lead_date: body.lead_date || new Date().toISOString().split('T')[0],
      lead_source: body.lead_source || 'Inbound - Referral',
      lead_stage: body.lead_stage || 'Discovery',
      connect_date: body.connect_date || null,
      comments: body.comments || null,
      followup2_date: body.followup2_date || null,
      followup2_comments: body.followup2_comments || null,
      lead_status: body.lead_status || 'New',
    };

    const { data, error } = await supabase.from('leads').insert(payload).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, lead: data }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[API /api/sales-leads POST Error]:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, patch } = await req.json();
    if (!id || !patch) {
      return NextResponse.json({ error: 'Missing id or patch' }, { status: 400, headers: corsHeaders });
    }

    const sanitized: any = { ...patch };
    if ('connect_date' in sanitized && !sanitized.connect_date) sanitized.connect_date = null;
    if ('followup2_date' in sanitized && !sanitized.followup2_date) sanitized.followup2_date = null;
    if ('lead_date' in sanitized && !sanitized.lead_date) sanitized.lead_date = new Date().toISOString().split('T')[0];

    const supabase = getAdminClient();
    const { error } = await supabase.from('leads').update(sanitized).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[API /api/sales-leads PATCH Error]:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}
