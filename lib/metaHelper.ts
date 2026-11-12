/**
 * Lead Metadata Helpers
 * Handles robust column extraction from CSV / XLSX and transparently persists
 * first_name, last_name, designation, and contact_no in Supabase even if the
 * Postgres schema has not had migrations applied yet.
 */

export function cleanValue(v: any): string {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return '';
  return s;
}

export function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function extractFromRow(row: Record<string, any>, aliasList: string[]): string {
  const normAliases = aliasList.map(normalizeKey);

  // 1st pass: exact match on normalized key
  for (const alias of normAliases) {
    for (const key of Object.keys(row)) {
      if (normalizeKey(key) === alias) {
        const val = cleanValue(row[key]);
        if (val) return val;
      }
    }
  }

  // 2nd pass: key contains alias (e.g. key 'corporate_phone_number' contains 'corporatephone')
  for (const alias of normAliases) {
    for (const key of Object.keys(row)) {
      const normK = normalizeKey(key);
      if (normK.includes(alias)) {
        const val = cleanValue(row[key]);
        if (val) return val;
      }
    }
  }

  return '';
}

export const FIRST_NAME_ALIASES = ['first name', 'firstname', 'fname', 'first_name', 'given name'];
export const LAST_NAME_ALIASES = ['last name', 'lastname', 'lname', 'last_name', 'surname'];
export const FULL_NAME_ALIASES = ['name', 'full name', 'fullname', 'contact name', 'person name', 'lead name'];
export const DESIGNATION_ALIASES = ['designation', 'title', 'role', 'job title', 'position', 'seniority'];
export const CONTACT_NO_ALIASES = [
  'contact no',
  'contact number',
  'corporate phone',
  'corporate phone number',
  'corporate phone no',
  'corp phone',
  'mobile phone',
  'mobile no',
  'mobile number',
  'phone number',
  'phone no',
  'phone',
  'contact',
  'cell phone',
  'cell',
  'work direct phone',
  'work phone',
  'company phone'
];
export const EMAIL_ALIASES = ['email', 'email id', 'work email', 'email address', 'lead email'];
export const COMPANY_ALIASES = ['company', 'company name', 'company name for emails', 'client', 'account', 'organization'];

export function parseLeadRow(row: Record<string, any>) {
  let firstName = extractFromRow(row, FIRST_NAME_ALIASES);
  let lastName = extractFromRow(row, LAST_NAME_ALIASES);
  if (!firstName && !lastName) {
    const fullName = extractFromRow(row, FULL_NAME_ALIASES);
    if (fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
  }
  const designation = extractFromRow(row, DESIGNATION_ALIASES);
  const contactNo = extractFromRow(row, CONTACT_NO_ALIASES);
  const email = extractFromRow(row, EMAIL_ALIASES);
  const company = extractFromRow(row, COMPANY_ALIASES);

  return { firstName, lastName, designation, contactNo, email, company };
}

export function encodeLeadComments(
  userComments: string | null | undefined,
  meta: { first_name?: string | null; last_name?: string | null; designation?: string | null; contact_no?: string | null }
): string {
  const base = (userComments || '').replace(/<!--lead-meta:[\s\S]*?-->/g, '').trim();
  const payload = {
    contact_no: meta.contact_no || '',
    first_name: meta.first_name || '',
    last_name: meta.last_name || '',
    designation: meta.designation || ''
  };
  const metaTag = `<!--lead-meta:${JSON.stringify(payload)}-->`;
  return base ? `${base}\n${metaTag}` : metaTag;
}

export function decodeLeadComments(rawComments: string | null | undefined): { comments: string; meta: Record<string, string> } {
  if (!rawComments) return { comments: '', meta: {} };
  const match = rawComments.match(/<!--lead-meta:([\s\S]*?)-->/);
  let meta: Record<string, string> = {};
  if (match && match[1]) {
    try {
      meta = JSON.parse(match[1]);
    } catch {}
  }
  const comments = rawComments.replace(/<!--lead-meta:[\s\S]*?-->/g, '').trim();
  return { comments, meta };
}

export function enrichLeadRecord(lead: any, metaCache: Record<string, any> = {}): any {
  const idMeta = lead.id ? metaCache[lead.id] : null;
  const emailMeta = lead.email ? metaCache[lead.email.toLowerCase()] : null;
  const { comments: cleanComments, meta: commentMeta } = decodeLeadComments(lead.comments);

  const firstName = lead.first_name || commentMeta.first_name || idMeta?.firstName || idMeta?.first_name || emailMeta?.firstName || emailMeta?.first_name || '';
  const lastName = lead.last_name || commentMeta.last_name || idMeta?.lastName || idMeta?.last_name || emailMeta?.lastName || emailMeta?.last_name || '';
  const designation = lead.designation || commentMeta.designation || idMeta?.designation || emailMeta?.designation || '';
  const contactNo = lead.contact_no || commentMeta.contact_no || idMeta?.contactNo || idMeta?.contact_no || emailMeta?.contactNo || emailMeta?.contact_no || '';
  const company = lead.company || idMeta?.company || emailMeta?.company || '';

  return {
    ...lead,
    comments: cleanComments,
    first_name: firstName,
    last_name: lastName,
    designation,
    contact_no: contactNo,
    company
  };
}
