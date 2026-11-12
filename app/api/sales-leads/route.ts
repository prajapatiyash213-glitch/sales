import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cleanValue,
  encodeLeadComments,
  decodeLeadComments,
  enrichLeadRecord,
  CONTACT_NO_ALIASES,
  FIRST_NAME_ALIASES,
  LAST_NAME_ALIASES,
  DESIGNATION_ALIASES,
  COMPANY_ALIASES,
  extractFromRow
} from '@/lib/metaHelper';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://takqbngsfdwburtujtsc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  Buffer.from('c2Jfc2VjcmV0X3J2RWtuazdLRkRZZC1wR0FHTDNQLVFfekw2bTkyRUY=', 'base64').toString('utf-8');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

    const enrichedLeads = (leadsRes.data || []).map((l: any) => enrichLeadRecord(l));

    return NextResponse.json(
      { profiles: profRes.data || [], leads: enrichedLeads },
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

    const firstName = extractFromRow(body, FIRST_NAME_ALIASES) || cleanValue(body.first_name || body.firstName || '');
    const lastName = extractFromRow(body, LAST_NAME_ALIASES) || cleanValue(body.last_name || body.lastName || '');
    const designation = extractFromRow(body, DESIGNATION_ALIASES) || cleanValue(body.designation || body.title || '');
    const contactNo = extractFromRow(body, CONTACT_NO_ALIASES) || cleanValue(
      body.contact_no || body.contactNo || body['Contact No'] || body['Contact No.'] ||
      body.corporate_phone || body.corporatePhone || body['Corporate Phone'] ||
      body.phone || body.mobile || body.work_phone || ''
    );
    const company = extractFromRow(body, COMPANY_ALIASES) || cleanValue(body.company || body.company_name || '');
    const userComments = cleanValue(body.comments);

    const storedComments = encodeLeadComments(userComments, {
      first_name: firstName,
      last_name: lastName,
      designation,
      contact_no: contactNo
    });

    const payload: any = {
      first_name: firstName,
      last_name: lastName,
      designation,
      contact_no: contactNo,
      email: body.email,
      company: company,
      brand: body.brand || 'Tecnoprism',
      owner_id: body.owner_id || 'e1914945-b140-46b6-b13d-82b45f053f24',
      lead_date: body.lead_date || new Date().toISOString().split('T')[0],
      lead_source: body.lead_source || 'Inbound - Referral',
      lead_stage: body.lead_stage || 'Discovery',
      connect_date: body.connect_date || null,
      comments: storedComments,
      followup2_date: body.followup2_date || null,
      followup2_comments: body.followup2_comments || null,
      lead_status: body.lead_status || 'New',
    };

    const cleanEmail = String(body.email || '').trim().toLowerCase();
    if (cleanEmail) {
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('email', cleanEmail)
        .limit(1);

      if (existingLeads && existingLeads.length > 0) {
        const rawExisting = existingLeads[0];
        const existing = enrichLeadRecord(rawExisting);
        const patch: any = {};

        if (firstName && firstName !== existing.first_name) patch.first_name = firstName;
        if (lastName && lastName !== existing.last_name) patch.last_name = lastName;
        if (designation && designation !== existing.designation) patch.designation = designation;
        if (contactNo && contactNo !== existing.contact_no) patch.contact_no = contactNo;
        if (company && company !== existing.company) patch.company = company;
        if (payload.brand && payload.brand !== existing.brand) patch.brand = payload.brand;
        if (payload.lead_source && payload.lead_source !== existing.lead_source) patch.lead_source = payload.lead_source;
        if (payload.lead_stage && payload.lead_stage !== existing.lead_stage) patch.lead_stage = payload.lead_stage;
        if (payload.lead_status && payload.lead_status !== existing.lead_status) patch.lead_status = payload.lead_status;

        const effectiveComments = userComments || existing.comments;
        const newStoredComments = encodeLeadComments(effectiveComments, {
          first_name: patch.first_name || existing.first_name,
          last_name: patch.last_name || existing.last_name,
          designation: patch.designation || existing.designation,
          contact_no: patch.contact_no || existing.contact_no
        });

        if (newStoredComments !== rawExisting.comments) {
          patch.comments = newStoredComments;
        }

        if (Object.keys(patch).length > 0) {
          let { data: updatedData, error: updateErr } = await supabase.from('leads').update(patch).eq('id', existing.id).select().single();
          if (updateErr && (updateErr.code === 'PGRST204' || updateErr.message?.includes('column') || updateErr.message?.includes('company'))) {
            const fallbackPatch = { ...patch };
            delete fallbackPatch.first_name;
            delete fallbackPatch.last_name;
            delete fallbackPatch.designation;
            delete fallbackPatch.contact_no;
            if (updateErr.message?.includes('company')) delete fallbackPatch.company;
            if (Object.keys(fallbackPatch).length > 0) {
              const retry = await supabase.from('leads').update(fallbackPatch).eq('id', existing.id).select().single();
              updatedData = retry.data;
            }
          }
          const finalLead = enrichLeadRecord(updatedData || { ...rawExisting, ...patch });
          return NextResponse.json({ success: true, updated: true, lead: finalLead }, { headers: corsHeaders });
        } else {
          return NextResponse.json({ success: true, duplicate: true, lead: existing }, { headers: corsHeaders });
        }
      }
    }

    let { data, error } = await supabase.from('leads').insert(payload).select().single();
    if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('company'))) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.first_name;
      delete fallbackPayload.last_name;
      delete fallbackPayload.designation;
      delete fallbackPayload.contact_no;
      if (error.message?.includes('company')) delete fallbackPayload.company;
      const retry = await supabase.from('leads').insert(fallbackPayload).select().single();
      error = retry.error;
      data = retry.data;
    }
    if (error) throw error;

    const returnLead = enrichLeadRecord(data || payload);
    return NextResponse.json({ success: true, lead: returnLead }, { headers: corsHeaders });
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

    // Check if patch modifies metadata fields; if so, also encode into comments
    const hasMetaChanges = 'contact_no' in sanitized || 'contactNo' in sanitized ||
      'first_name' in sanitized || 'firstName' in sanitized ||
      'last_name' in sanitized || 'lastName' in sanitized ||
      'designation' in sanitized || 'comments' in sanitized;

    if (hasMetaChanges) {
      const { data: curLead } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
      if (curLead) {
        const decoded = enrichLeadRecord(curLead);
        const nextFn = sanitized.first_name !== undefined ? sanitized.first_name : (sanitized.firstName !== undefined ? sanitized.firstName : decoded.first_name);
        const nextLn = sanitized.last_name !== undefined ? sanitized.last_name : (sanitized.lastName !== undefined ? sanitized.lastName : decoded.last_name);
        const nextDes = sanitized.designation !== undefined ? sanitized.designation : decoded.designation;
        const nextPh = sanitized.contact_no !== undefined ? sanitized.contact_no : (sanitized.contactNo !== undefined ? sanitized.contactNo : decoded.contact_no);
        const nextComm = sanitized.comments !== undefined ? sanitized.comments : decoded.comments;

        sanitized.comments = encodeLeadComments(nextComm, {
          first_name: nextFn,
          last_name: nextLn,
          designation: nextDes,
          contact_no: nextPh
        });
      }
    }

    let { error } = await supabase.from('leads').update(sanitized).eq('id', id);
    if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('company'))) {
      const fallback = { ...sanitized };
      delete fallback.first_name;
      delete fallback.last_name;
      delete fallback.designation;
      delete fallback.contact_no;
      if (error.message?.includes('company')) delete fallback.company;
      const retry = await supabase.from('leads').update(fallback).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[API /api/sales-leads PATCH Error]:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getAdminClient();
    // Wipe all leads from table
    const { error } = await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'All leads successfully deleted' }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[API /api/sales-leads DELETE Error]:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}
