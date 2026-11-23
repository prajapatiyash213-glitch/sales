'use client';
import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Lead } from '@/lib/types';
import { useToast } from './Toast';
import { parseLeadRow, extractFromRow, encodeLeadComments, enrichLeadRecord, EMAIL_REGEX, sanitizeAndExtractEmail, isValidContactNo } from '@/lib/metaHelper';

interface Props {
  open: boolean;
  onClose: () => void;
  me: Profile;
  people: Profile[];
  reload: () => Promise<void>;
  leads?: Lead[];
}

interface ParsedLead {
  first_name?: string;
  last_name?: string;
  designation?: string;
  contact_no?: string;
  email: string;
  company?: string;
  brand: string;
  owner_id: string;
  owner_name: string;
  lead_source: string;
  lead_stage: string;
  lead_status: string;
  comments?: string;
  connect_date?: string | null;
  date_of_connect?: string | null;
  followup2_date?: string | null;
  followup2_comments?: string | null;
}

interface UploadedFileInfo {
  name: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  count: number;
}

import { BRANDS, STATUSES, STAGES } from '@/lib/constants';

const VALID_STATUSES = STATUSES;
const VALID_STAGES = STAGES.map(s => s.key);

function normalizeStatus(raw: string): string {
  if (!raw) return 'New';
  const clean = raw.trim().toLowerCase();
  const match = VALID_STATUSES.find(s => s.toLowerCase() === clean);
  if (match) return match;
  if (clean.includes('attempt')) return 'Attempted to Contact';
  if (clean.includes('contact')) return 'Contacted';
  if (clean.includes('demo sched') || clean.includes('meeting sched')) return 'Demo Scheduled';
  if (clean.includes('prospect') || clean.includes('demo done') || clean.includes('meeting done')) return 'Prospect (Meeting/Demo done)';
  if (clean.includes('junk') || clean.includes('spam')) return 'Junk Lead';
  if (clean.includes('closed lost') || clean.includes('lost') || clean.includes('dropped') || clean.includes('dead')) return 'Closed Lost';
  if (clean.includes('nurture')) return 'Nurture';
  if (clean.includes('opportunity') || clean.includes('won') || clean.includes('converted')) return 'Opportunity';
  return 'New';
}

function normalizeStage(raw: string): string {
  if (!raw) return 'Discovery';
  const clean = raw.trim().toLowerCase();
  const match = VALID_STAGES.find(s => s.toLowerCase() === clean);
  if (match) return match;
  if (clean.includes('disco') || clean.includes('new')) return 'Discovery';
  if (clean.includes('quali')) return 'Qualified';
  if (clean.includes('opport')) return 'Opportunity';
  if (clean.includes('pilot') || clean.includes('poc')) return 'Pilot/POC';
  if (clean.includes('propos')) return 'Proposal';
  if (clean.includes('nego') || clean.includes('value')) return 'Value Negotiation';
  if (clean.includes('closed lost') || clean.includes('lost')) return 'Closed Lost';
  if (clean.includes('closed won') || clean.includes('won')) return 'Closed Won';
  if (clean.includes('client') || clean.includes('customer')) return 'Client';
  return 'Discovery';
}

export default function ImportModal({ open, onClose, me, people, reload, leads = [] }: Props) {
  const toast = useToast();
  const isAdmin = me?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastUploaded, setLastUploaded] = useState<UploadedFileInfo | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('auto');
  const [selectedBrand, setSelectedBrand] = useState<string>('auto');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('last_uploaded_sales_lead_file');
        if (saved) {
          setLastUploaded(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Failed to read last uploaded file info:', err);
      }
    }
    if (open) {
      setSelectedOwnerId('auto');
      setSelectedBrand('auto');
    }
  }, [open]);

  if (!open) return null;

  function findMember(ownerInput: string): Profile | null {
    if (!ownerInput) return null;
    const clean = ownerInput.trim().toLowerCase();
    return (
      people.find(
        p =>
          p.full_name.trim().toLowerCase() === clean ||
          p.email.trim().toLowerCase() === clean ||
          p.full_name.trim().toLowerCase().includes(clean) ||
          clean.includes(p.full_name.trim().toLowerCase())
      ) ?? null
    );
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError('');

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawData.length) {
          setError('The selected file contains no data.');
          setParsed([]);
          return;
        }

        const leadsList: ParsedLead[] = [];

        rawData.forEach(row => {
          const parsed = parseLeadRow(row);
          const firstName = parsed.firstName;
          const lastName = parsed.lastName;
          const designation = parsed.designation;
          const contactNo = parsed.contactNo;
          const email = parsed.email;
          let company = parsed.company;

          let brand = extractFromRow(row, ['brand', 'brand name']);
          if (!brand || !BRANDS.includes(brand)) {
            const matchedBrand = BRANDS.find(b => b.toLowerCase() === (brand || '').toLowerCase());
            brand = matchedBrand || BRANDS[0];
          }

          const ownerRaw = extractFromRow(row, ['owner', 'ownership', 'owner name', 'sales member', 'assigned to', 'allocated to']);
          const source = extractFromRow(row, ['source', 'lead source', 'channel']) || 'Excel Import';
          const rawStage = extractFromRow(row, ['stage', 'lead stage']);
          const rawStatus = extractFromRow(row, ['status', 'lead status']);
          const comments = extractFromRow(row, ['comments', 'notes', 'comment', 'note']);

          const cleanEmail = sanitizeAndExtractEmail(email);
          if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) return; // Skip invalid rows or rows without valid emails

          const stage = normalizeStage(rawStage);
          const status = normalizeStatus(rawStatus);
          const matchedOwner = findMember(ownerRaw);
          const allocatedOwner = matchedOwner ?? me;

          leadsList.push({
            first_name: firstName,
            last_name: lastName,
            designation,
            contact_no: contactNo,
            email: cleanEmail,
            company,
            brand,
            owner_id: allocatedOwner.id,
            owner_name: allocatedOwner.full_name || allocatedOwner.email,
            lead_source: source,
            lead_stage: stage,
            lead_status: status,
            connect_date: parsed.connectDate,
            comments: parsed.comments,
            followup2_date: parsed.followup2Date,
            followup2_comments: parsed.followup2Comments
          });
        });

        if (!leadsList.length) {
          setError('Could not find valid Email column in the file.');
          setParsed([]);
        } else {
          setParsed(leadsList);
        }
      } catch (err) {
        setError('Could not parse Excel/CSV file: ' + (err as Error).message);
      }
    };
    reader.readAsBinaryString(selected);
  }

  function handleRemoveFile() {
    if (!isAdmin) {
      toast.show('Permission denied: Only administrators can remove uploaded files.');
      return;
    }
    setFile(null);
    setParsed([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('last_uploaded_sales_lead_file');
        setLastUploaded(null);
      } catch (err) {
        console.error('Failed to clear uploaded file info:', err);
      }
    }
    toast.show('Uploaded file removed successfully.');
  }

  async function handleImport() {
    if (!parsed.length) return;
    setBusy(true);
    setError('');

    try {
      const supabase = createClient();

      // Read metadata cache for client-persisted fields (phone, designation, etc.)
      let metaCache: Record<string, any> = {};
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('sales_lead_metadata_cache_v1');
          if (raw) metaCache = JSON.parse(raw);
        } catch {}
      }

      // Deduplicate within the uploaded file itself (latest occurrence in sheet takes precedence)
      const dedupedMap = new Map<string, ParsedLead>();
      parsed.forEach(l => {
        const key = l.email.toLowerCase();
        dedupedMap.set(key, l);
      });
      const uniqueParsed = Array.from(dedupedMap.values());

      // Query all existing leads with these emails
      const uniqueEmails = Array.from(new Set(uniqueParsed.map(l => l.email.toLowerCase())));
      const existingMap = new Map<string, any>();
      for (let i = 0; i < uniqueEmails.length; i += 100) {
        const chunk = uniqueEmails.slice(i, i + 100);
        const { data } = await supabase.from('leads').select('*').in('email', chunk);
        ((data as any[]) || []).forEach((row: any) => existingMap.set(row.email.toLowerCase(), enrichLeadRecord(row, metaCache)));
      }

      const toInsert: ParsedLead[] = [];
      let skippedCount = 0;

      for (const l of uniqueParsed) {
        const emailKey = l.email.toLowerCase();
        const existing = existingMap.get(emailKey) || (leads && leads.find(el => el.email?.trim().toLowerCase() === emailKey));

        if (existing) {
          // STRICT RULE: Existing data must NOT change under any circumstances ("existing data as it is not change in exists data")
          skippedCount++;
          continue;
        }

        // Brand new lead: Apply chosen owner and brand (if specified), or keep detected from file
        const finalOwnerId = selectedOwnerId !== 'auto' ? selectedOwnerId : (l.owner_id || me.id);
        const finalOwner = people.find(p => p.id === finalOwnerId) || me;
        const finalBrand = selectedBrand !== 'auto' ? selectedBrand : (l.brand || BRANDS[0]);

        toInsert.push({
          ...l,
          owner_id: finalOwnerId,
          owner_name: finalOwner.full_name || finalOwner.email,
          brand: finalBrand
        });
      }

      // Existing records are strictly preserved as-is without any updates
      const updatedCount = 0;

      // 2. Process inserts for new leads
      let insertedCount = 0;
      if (toInsert.length > 0) {
        const insertData = toInsert.filter(l => l.email && EMAIL_REGEX.test(l.email.trim())).map(l => {
          const encodedComments = encodeLeadComments(l.comments, {
            first_name: l.first_name,
            last_name: l.last_name,
            designation: l.designation,
            contact_no: l.contact_no
          });
          return {
            first_name: l.first_name || null,
            last_name: l.last_name || null,
            designation: l.designation || null,
            contact_no: l.contact_no || null,
            email: l.email.trim().toLowerCase(),
            company: l.company || null,
            brand: l.brand,
            owner_id: l.owner_id,
            lead_source: l.lead_source,
            lead_stage: l.lead_stage,
            lead_status: l.lead_status || 'New',
            connect_date: l.connect_date || null,
            comments: encodedComments,
            followup2_date: l.followup2_date || null,
            followup2_comments: l.followup2_comments || null
          };
        });

        let { data: insertedLeads, error } = await supabase.from('leads').insert(insertData).select();
        if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('company'))) {
          const fallbackInsert = insertData.map(({ first_name, last_name, designation, contact_no, company, ...rest }: any) => {
            const item: any = { ...rest };
            if (!error.message?.includes('company')) item.company = company;
            return item;
          });
          const retry = await supabase.from('leads').insert(fallbackInsert).select();
          error = retry.error;
          insertedLeads = retry.data;
        }

        if (error) {
          if (error.code === '23514' || error.message?.includes('check constraint') || error.message?.includes('email_format')) {
            setError(`Database constraint error: ${error.message}. Run this command in Supabase SQL Editor to allow all emails:\nALTER TABLE public.leads DROP CONSTRAINT IF EXISTS email_format;`);
          } else {
            setError(error.message);
          }
          setBusy(false);
          return;
        }

        toInsert.forEach((p, idx) => {
          const saved = insertedLeads?.[idx];
          const metaKey = saved?.id || p.email.toLowerCase();
          const meta = {
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            designation: p.designation || '',
            contactNo: p.contact_no || '',
            company: p.company || ''
          };
          metaCache[metaKey] = meta;
          metaCache[p.email.toLowerCase()] = meta;
        });

        insertedCount = toInsert.length;
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sales_lead_metadata_cache_v1', JSON.stringify(metaCache));
        } catch {}
      }

      const fileInfo: UploadedFileInfo = {
        name: file?.name || 'leads_imported.xlsx',
        size: file?.size || 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: me?.full_name || me?.email || 'Admin',
        count: parsed.length
      };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('last_uploaded_sales_lead_file', JSON.stringify(fileInfo));
          setLastUploaded(fileInfo);
        } catch (err) {
          console.error('Failed to save uploaded file info:', err);
        }
      }

      // Notification message detailing deduplication results
      let successMsg = '';
      if (insertedCount > 0 && skippedCount > 0) {
        successMsg = `Import completed: ${insertedCount} new leads added. ${skippedCount} existing leads kept 100% untouched.`;
      } else if (insertedCount > 0) {
        successMsg = `Import completed: ${insertedCount} new leads added.`;
      } else {
        successMsg = `All ${skippedCount} leads already exist in CRM. Existing data kept 100% untouched.`;
      }

      toast.show(successMsg);
      await reload();
      setBusy(false);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const existingEmailSet = new Set((leads || []).map(l => (l.email || '').trim().toLowerCase()));
  const newLeadsCount = parsed.filter(l => !existingEmailSet.has(l.email.trim().toLowerCase())).length;

  const isStaged = !!file;
  const currentDisplayFile = file
    ? {
        name: file.name,
        size: file.size,
        count: parsed.length,
        uploadedAt: '',
        uploadedBy: me?.full_name || me?.email || 'Admin'
      }
    : lastUploaded;

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <div className="drawer open" style={{ width: 'min(640px, 100%)' }}>
        <div className="dr-head">
          <h2>Import & Auto-Allocate Leads</h2>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        <div className="dr-body">
          <p className="muted" style={{ marginBottom: 16 }}>
            Upload an Excel (`.xlsx`, `.xls`) or CSV file. The system will automatically match the <b>Ownership / Sales Member</b> column to your team members and assign each lead automatically!
          </p>

          {error && <div className="alert" role="alert">{error}</div>}

          <div style={{ background: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 16 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              style={{ width: '100%' }}
            />
            <div className="small muted" style={{ marginTop: 8 }}>
              Supported columns: <b>First Name, Last Name, Designation, Contact No / Corporate Phone, Email, Company, Brand, Ownership, Source, Stage</b>
            </div>
          </div>

          {/* Uploaded / Selected File Name & Admin Removal Box */}
          <div
            style={{
              background: '#FFFFFF',
              border: currentDisplayFile ? '1.5px solid #CBD5E1' : '1px dashed #E2E8F0',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              boxShadow: currentDisplayFile ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            {currentDisplayFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: currentDisplayFile.name.endsWith('.csv') ? '#ECFDF5' : '#EFF6FF',
                      color: currentDisplayFile.name.endsWith('.csv') ? '#059669' : '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      fontWeight: 800,
                      flexShrink: 0
                    }}
                  >
                    {currentDisplayFile.name.endsWith('.csv') ? '📄' : '📊'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', wordBreak: 'break-all' }}>
                        {currentDisplayFile.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: isStaged ? '#FEF3C7' : '#DCFCE7',
                          color: isStaged ? '#92400E' : '#166534',
                          border: isStaged ? '1px solid #FCD34D' : '1px solid #86EFAC'
                        }}
                      >
                        {isStaged ? 'Selected (Ready to Import)' : 'Previously Uploaded'}
                      </span>
                    </div>
                    <div className="small muted" style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {currentDisplayFile.size > 0 && <span>{(currentDisplayFile.size / 1024).toFixed(1)} KB</span>}
                      {currentDisplayFile.size > 0 && <span>•</span>}
                      <span>{currentDisplayFile.count} {currentDisplayFile.count === 1 ? 'lead' : 'leads'} detected</span>
                      {currentDisplayFile.uploadedAt && (
                        <>
                          <span>•</span>
                          <span>Uploaded {new Date(currentDisplayFile.uploadedAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="btn"
                      style={{
                        background: '#FEE2E2',
                        color: '#991B1B',
                        borderColor: '#F87171',
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                      title="Admin action: Remove uploaded file"
                    >
                      🗑️ Remove File
                    </button>
                  ) : (
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <button
                        type="button"
                        disabled
                        className="btn"
                        style={{
                          background: '#F1F5F9',
                          color: '#94A3B8',
                          borderColor: '#CBD5E1',
                          padding: '7px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          opacity: 0.75
                        }}
                        title="Permission restricted: Only administrators can remove uploaded files"
                      >
                        🔒 Remove File (Admin only)
                      </button>
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>Admin role required</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: 13, padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📁</span>
                  <span>No file currently uploaded. Choose an Excel or CSV file above.</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: isAdmin ? '#E0F2FE' : '#F1F5F9',
                    color: isAdmin ? '#0369A1' : '#64748B'
                  }}
                >
                  {isAdmin ? '🛡️ Admin Access' : 'User Access'}
                </span>
              </div>
            )}
          </div>

          {parsed.length > 0 && (() => {
            const existingEmailSet = new Set((leads || []).map(l => (l.email || '').trim().toLowerCase()));
            const detectedCompanies = Array.from(new Set(parsed.map(p => p.company?.trim()).filter(Boolean) as string[]));
            const existingInPreviewCount = parsed.filter(l => existingEmailSet.has(l.email.trim().toLowerCase())).length;
            const newInPreviewCount = parsed.length - existingInPreviewCount;
            const selectedOwner = people.find(p => p.id === selectedOwnerId);

            return (
              <div>
                {/* Company Upload Options & Ownership/Brand Selection */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: '16px',
                    marginBottom: 16
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🏢</span>
                      <strong style={{ fontSize: 14, color: '#0F172A' }}>
                        {detectedCompanies.length > 0
                          ? `Company: ${detectedCompanies.slice(0, 3).join(', ')}${detectedCompanies.length > 3 ? ` (+${detectedCompanies.length - 3} more)` : ''}`
                          : 'Company Data Import Options'}
                      </strong>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        background: '#ECFDF5',
                        color: '#065F46',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontWeight: 700,
                        border: '1px solid #A7F3D0'
                      }}
                    >
                      🛡️ Existing CRM Data: 100% Protected (No Changes)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    {/* Ownership Selection */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        👤 Assign Ownership (Sales Member / Admin):
                      </label>
                      <select
                        value={selectedOwnerId}
                        onChange={e => setSelectedOwnerId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #CBD5E1',
                          fontSize: 13,
                          background: '#FFFFFF',
                          color: '#0F172A',
                          fontWeight: 500
                        }}
                      >
                        <option value="auto">⚡ Auto (Keep from file or assign to me)</option>
                        {people.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.email} ({p.role === 'admin' ? 'Admin' : 'Sales'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Brand Selection */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        🏷️ Select Brand:
                      </label>
                      <select
                        value={selectedBrand}
                        onChange={e => setSelectedBrand(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #CBD5E1',
                          fontSize: 13,
                          background: '#FFFFFF',
                          color: '#0F172A',
                          fontWeight: 500
                        }}
                      >
                        <option value="auto">⚡ Auto (Keep from file / Auto-detect)</option>
                        {BRANDS.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>ℹ️</span>
                    <span>
                      Existing CRM records will remain completely untouched. The selected Owner &amp; Brand apply strictly to <strong>new incoming leads</strong>.
                    </span>
                  </div>
                </div>

                {/* Table Header and Summary */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                    Preview ({parsed.length} leads in file)
                  </h3>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ background: '#DCFCE7', color: '#166534', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                      ✨ {newInPreviewCount} New
                    </span>
                    {existingInPreviewCount > 0 && (
                      <span style={{ background: '#F1F5F9', color: '#475569', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
                        🔒 {existingInPreviewCount} Existing (Kept as-is)
                      </span>
                    )}
                  </div>
                </div>

                {/* Preview Table */}
                <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Name</th>
                        <th>Designation</th>
                        <th>Contact No</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Brand</th>
                        <th>Allocated To</th>
                        <th>Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((item, idx) => {
                        const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ');
                        const isExisting = existingEmailSet.has(item.email.trim().toLowerCase());
                        const displayBrand = isExisting
                          ? item.brand
                          : (selectedBrand !== 'auto' ? selectedBrand : item.brand);
                        const displayOwnerName = isExisting
                          ? item.owner_name
                          : (selectedOwnerId !== 'auto' && selectedOwner ? (selectedOwner.full_name || selectedOwner.email) : item.owner_name);

                        return (
                          <tr key={idx} style={{ opacity: isExisting ? 0.75 : 1 }}>
                            <td>
                              {isExisting ? (
                                <span style={{ background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                  🔒 Existing
                                </span>
                              ) : (
                                <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                  ✨ New
                                </span>
                              )}
                            </td>
                            <td>{fullName || '—'}</td>
                            <td>{item.designation || '—'}</td>
                            <td>{item.contact_no && isValidContactNo(item.contact_no) ? item.contact_no : '—'}</td>
                            <td>{item.email}</td>
                            <td>{item.company || '—'}</td>
                            <td><strong>{displayBrand}</strong></td>
                            <td>
                              <span className="role-tag admin" style={{ background: '#E0F2FE', color: '#0369A1' }}>
                                👤 {displayOwnerName}
                              </span>
                            </td>
                            <td>{item.lead_stage}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="dr-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={handleImport} disabled={!parsed.length || busy}>
            {busy ? 'Importing…' : (newLeadsCount > 0 ? `Import ${newLeadsCount} New Leads` : (parsed.length > 0 ? 'All Leads Already Exist (Kept as-is)' : 'Import Leads'))}
          </button>
        </div>
      </div>
    </>
  );
}
