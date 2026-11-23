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

export function isValidContactNo(val: string): boolean {
  if (!val) return false;
  const s = String(val).trim();
  // Under NO circumstances should an email or string containing @ be a contact number
  if (s.includes('@')) return false;
  // Hex IDs (like Apollo/MongoDB 16+ hex chars) are IDs, not phone numbers
  if (/^[a-f0-9]{16,}$/i.test(s.replace(/\s+/g, ''))) return false;
  // Must contain at least one digit
  if (!/\d/.test(s)) return false;
  // Must not have more letters than digits
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  if (letters > digits) return false;
  return true;
}

export function isValidName(val: string): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (s.includes('@')) return false;
  if (/^(http|https|www\.)/i.test(s)) return false;
  return true;
}

export function isValidText(val: string): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (s.includes('@')) return false;
  return true;
}

export interface ExtractOptions {
  excludeKeySubstrings?: string[];
  validator?: (val: string) => boolean;
}

export function extractFromRow(
  row: Record<string, any>,
  aliasList: string[],
  options?: ExtractOptions
): string {
  const normAliases = aliasList.map(normalizeKey);
  const excludeSubs = (options?.excludeKeySubstrings || []).map(normalizeKey);
  const validator = options?.validator || ((v: string) => !!v);

  // 1st pass: exact match on normalized key
  // If an exact matching column exists in the row:
  // If it has a valid value, return it.
  // If it is blank/empty, return '' immediately!
  // A column that was explicitly present in Excel but left blank MUST remain blank (no fallback guessing).
  for (const alias of normAliases) {
    for (const key of Object.keys(row)) {
      const normK = normalizeKey(key);
      if (normK === alias) {
        const val = cleanValue(row[key]);
        if (val && validator(val)) return val;
        return '';
      }
    }
  }

  // 2nd pass: key contains alias (e.g. key 'corporate_phone_number' contains 'corporatephone')
  // Only for specific aliases >= 5 chars to avoid short generic matches like 'name' or 'date',
  // and excluding forbidden substrings (e.g. 'email' when searching for phone).
  for (const alias of normAliases) {
    if (alias.length < 5) continue;
    for (const key of Object.keys(row)) {
      const normK = normalizeKey(key);
      if (excludeSubs.some(sub => normK.includes(sub))) continue;
      if (normK.includes(alias)) {
        const val = cleanValue(row[key]);
        if (val && validator(val)) return val;
      }
    }
  }

  return '';
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeAndExtractEmail(raw: any): string {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^mailto:/i, '').replace(/^[<("'`]+|[>)"'`]+$/g, '').trim();
  if (EMAIL_REGEX.test(str)) return str.toLowerCase();
  const m = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (m && EMAIL_REGEX.test(m[0])) return m[0].toLowerCase();
  return '';
}

export function extractEmailFromRow(row: Record<string, any>): string {
  const normAliases = ['email', 'emailid', 'workemail', 'emailaddress', 'leademail'];

  // 1st pass: exact match on alias
  for (const alias of normAliases) {
    for (const key of Object.keys(row)) {
      if (normalizeKey(key) === alias) {
        const email = sanitizeAndExtractEmail(row[key]);
        if (email) return email;
      }
    }
  }

  // 2nd pass: contains alias, but explicitly ignore non-email fields like "Company Name for Emails" or "Email Open"
  for (const alias of normAliases) {
    for (const key of Object.keys(row)) {
      const k = normalizeKey(key);
      if (k.includes(alias) && !k.includes('company') && !k.includes('status') && !k.includes('source') && !k.includes('open') && !k.includes('bounce')) {
        const email = sanitizeAndExtractEmail(row[key]);
        if (email) return email;
      }
    }
  }

  return '';
}

export function parseFlexibleDate(val: any): string | null {
  if (!val) return null;
  let str = String(val).trim();
  if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  if (typeof val === 'number' || /^\d{5}$/.test(str)) {
    const num = Number(val);
    if (!isNaN(num) && num > 20000 && num < 60000) {
      const utc_days = Math.floor(num - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      return date_info.toISOString().split('T')[0];
    }
  }

  const dmyMatch = str.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  const clean = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  if (!/\d{4}/.test(clean)) {
    const currentYear = new Date().getFullYear();
    const withYear = `${clean} ${currentYear}`;
    const pYear = new Date(withYear);
    if (!isNaN(pYear.getTime())) {
      const y = pYear.getFullYear();
      const m = String(pYear.getMonth() + 1).padStart(2, '0');
      const d = String(pYear.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export const FIRST_NAME_ALIASES = ['first name', 'firstname', 'fname', 'first_name', 'given name'];
export const LAST_NAME_ALIASES = ['last name', 'lastname', 'lname', 'last_name', 'surname'];
export const FULL_NAME_ALIASES = ['name', 'full name', 'fullname', 'contact name', 'person name', 'lead name'];
export const DESIGNATION_ALIASES = ['designation', 'title', 'role', 'job title', 'position', 'seniority'];
export const CONTACT_NO_ALIASES = [
  'contact no',
  'contact number',
  'contactno',
  'contact#',
  'corporate phone',
  'corporate phone number',
  'corporate phone no',
  'corp phone',
  'mobile phone',
  'mobile no',
  'mobileno',
  'mobile number',
  'mobile',
  'phone number',
  'phone no',
  'phoneno',
  'phone',
  'cell phone',
  'cell',
  'work direct phone',
  'work phone',
  'company phone',
  'direct phone',
  'telephone'
];
export const EMAIL_ALIASES = ['email', 'email id', 'work email', 'email address', 'lead email'];
export const COMPANY_ALIASES = ['company', 'company name', 'company name for emails', 'client', 'account', 'organization'];

export const CONNECT_DATE_ALIASES = [
  'date of connect',
  'connect date',
  'date of contact',
  'first connect date',
  'connect_date',
  'date'
];

export const COMMENTS_ALIASES = [
  'comments',
  'comment',
  'first connect comments',
  'connect comments',
  'action',
  'lead comment',
  'notes',
  'note'
];

export const FOLLOWUP2_DATE_ALIASES = [
  'follow-up 2 date',
  'followup 2 date',
  'follow up 2 date',
  'followup2 date',
  'follow-up date',
  'followup date',
  'followup2_date'
];

export const FOLLOWUP2_COMMENTS_ALIASES = [
  'follow-up 2 comments',
  'follow-up 2 notes',
  'followup 2 comments',
  'followup 2 notes',
  'follow-up briefs',
  'follow-up comments',
  'followup comments',
  'comments_1',
  'comments 2',
  'second comments',
  'followup2_comments'
];

export function parseLeadRow(row: Record<string, any>) {
  let firstName = extractFromRow(row, FIRST_NAME_ALIASES, {
    excludeKeySubstrings: ['company', 'brand', 'email', 'mail', 'file', 'sheet', 'user', 'owner', 'account'],
    validator: isValidName
  });
  let lastName = extractFromRow(row, LAST_NAME_ALIASES, {
    excludeKeySubstrings: ['company', 'brand', 'email', 'mail', 'file', 'sheet', 'user', 'owner', 'account'],
    validator: isValidName
  });
  if (!firstName && !lastName) {
    const fullName = extractFromRow(row, FULL_NAME_ALIASES, {
      excludeKeySubstrings: ['company', 'brand', 'email', 'mail', 'file', 'sheet', 'user', 'owner', 'account'],
      validator: isValidName
    });
    if (fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
  }
  const designation = extractFromRow(row, DESIGNATION_ALIASES, {
    excludeKeySubstrings: ['email', 'mail', 'company', 'brand', 'file', 'sheet'],
    validator: isValidText
  });
  const contactNo = extractFromRow(row, CONTACT_NO_ALIASES, {
    excludeKeySubstrings: ['email', 'mail', 'id', 'name', 'person', 'title', 'company', 'brand', 'source', 'stage', 'status', 'url', 'web', 'link'],
    validator: isValidContactNo
  });
  const email = extractEmailFromRow(row);
  const company = extractFromRow(row, COMPANY_ALIASES, {
    excludeKeySubstrings: ['email', 'mail', 'user', 'owner', 'contact', 'person', 'phone'],
    validator: isValidText
  });
  const connectDate = parseFlexibleDate(extractFromRow(row, CONNECT_DATE_ALIASES));
  const comments = extractFromRow(row, COMMENTS_ALIASES);
  const followup2Date = parseFlexibleDate(extractFromRow(row, FOLLOWUP2_DATE_ALIASES));
  const followup2Comments = extractFromRow(row, FOLLOWUP2_COMMENTS_ALIASES);

  return {
    firstName: isValidName(firstName) ? firstName : '',
    lastName: isValidName(lastName) ? lastName : '',
    designation: isValidText(designation) ? designation : '',
    contactNo: isValidContactNo(contactNo) ? contactNo : '',
    email,
    company: isValidText(company) ? company : '',
    connectDate,
    comments,
    followup2Date,
    followup2Comments
  };
}

export function encodeLeadComments(
  userComments: string | null | undefined,
  meta: { first_name?: string | null; last_name?: string | null; designation?: string | null; contact_no?: string | null }
): string {
  const base = (userComments || '').replace(/<!--lead-meta:[\s\S]*?-->/g, '').trim();
  const payload = {
    contact_no: isValidContactNo(meta.contact_no || '') ? (meta.contact_no || '') : '',
    first_name: isValidName(meta.first_name || '') ? (meta.first_name || '') : '',
    last_name: isValidName(meta.last_name || '') ? (meta.last_name || '') : '',
    designation: isValidText(meta.designation || '') ? (meta.designation || '') : ''
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

  const rawFirstName = lead.first_name || commentMeta.first_name || idMeta?.firstName || idMeta?.first_name || emailMeta?.firstName || emailMeta?.first_name || '';
  const firstName = isValidName(rawFirstName) ? rawFirstName : '';
  const rawLastName = lead.last_name || commentMeta.last_name || idMeta?.lastName || idMeta?.last_name || emailMeta?.lastName || emailMeta?.last_name || '';
  const lastName = isValidName(rawLastName) ? rawLastName : '';
  const rawDesignation = lead.designation || commentMeta.designation || idMeta?.designation || emailMeta?.designation || '';
  const designation = isValidText(rawDesignation) ? rawDesignation : '';
  const rawContactNo = lead.contact_no || commentMeta.contact_no || idMeta?.contactNo || idMeta?.contact_no || emailMeta?.contactNo || emailMeta?.contact_no || '';
  const contactNo = isValidContactNo(rawContactNo) ? rawContactNo : '';
  const rawCompany = lead.company || idMeta?.company || emailMeta?.company || '';
  const company = isValidText(rawCompany) ? rawCompany : '';
  const connectDate = parseFlexibleDate(lead.connect_date || lead.date_of_connect) || lead.connect_date || lead.date_of_connect || null;
  const followup2Date = parseFlexibleDate(lead.followup2_date) || lead.followup2_date || null;

  return {
    ...lead,
    connect_date: connectDate,
    followup2_date: followup2Date,
    followup2_comments: lead.followup2_comments || '',
    comments: cleanComments,
    first_name: firstName,
    last_name: lastName,
    designation,
    contact_no: contactNo,
    company
  };
}
