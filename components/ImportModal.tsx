'use client';
import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  me: Profile;
  people: Profile[];
  reload: () => Promise<void>;
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
  date_of_connect?: string;
  followup2_date?: string;
  followup2_comments?: string;
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

export default function ImportModal({ open, onClose, me, people, reload }: Props) {
  const toast = useToast();
  const isAdmin = me?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastUploaded, setLastUploaded] = useState<UploadedFileInfo | null>(null);

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
          // Flexible key lookup
          const getCol = (names: string[]) => {
            for (const key of Object.keys(row)) {
              if (names.some(n => key.trim().toLowerCase() === n.toLowerCase())) {
                return String(row[key]).trim();
              }
            }
            return '';
          };

          const firstName = getCol(['first name', 'firstname', 'fname', 'first_name']);
          const lastName = getCol(['last name', 'lastname', 'lname', 'last_name']);
          const designation = getCol(['designation', 'title', 'role', 'job title', 'position']);
          const contactNo = getCol([
            'contact no',
            'contact number',
            'contact',
            'phone',
            'corporate phone',
            'corporate phone number',
            'corp phone',
            'corporate contact',
            'mobile',
            'cell',
            'phone number',
            'work direct phone',
            'direct phone'
          ]);
          const email = getCol(['email', 'work email', 'email address', 'lead email']);
          const company = getCol(['company', 'company name', 'client']);
          let brand = getCol(['brand', 'brand name']);
          if (!brand) {
            brand = getCol(['company', 'company name']) || BRANDS[0];
          }
          if (!BRANDS.includes(brand)) {
            const matchedBrand = BRANDS.find(b => b.toLowerCase() === brand.toLowerCase());
            brand = matchedBrand || BRANDS[0];
          }

          const ownerRaw = getCol(['owner', 'ownership', 'owner name', 'sales member', 'assigned to', 'allocated to']);
          const source = getCol(['source', 'lead source', 'channel']) || 'Excel Import';
          const rawStage = getCol(['stage', 'lead stage']);
          const rawStatus = getCol(['status', 'lead status']);
          const comments = getCol(['comments', 'notes']);

          if (!email) return; // Skip invalid rows

          const stage = normalizeStage(rawStage);
          const status = normalizeStatus(rawStatus);
          const matchedOwner = findMember(ownerRaw);
          const allocatedOwner = matchedOwner ?? me;

          leadsList.push({
            first_name: firstName,
            last_name: lastName,
            designation,
            contact_no: contactNo,
            email,
            company,
            brand,
            owner_id: allocatedOwner.id,
            owner_name: allocatedOwner.full_name || allocatedOwner.email,
            lead_source: source,
            lead_stage: stage,
            lead_status: status,
            comments
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
        ((data as any[]) || []).forEach((row: any) => existingMap.set(row.email.toLowerCase(), row));
      }

      const toInsert: ParsedLead[] = [];
      const toUpdate: { id: string; email: string; patch: any; patchMeta: any }[] = [];
      let skippedCount = 0;

      for (const l of uniqueParsed) {
        const emailKey = l.email.toLowerCase();
        const existing = existingMap.get(emailKey);

        if (existing) {
          // Lead already exists! Check if phone/contact_no or any other field changed
          const existingMeta = metaCache[existing.id] || metaCache[emailKey] || {};
          const curFirstName = existing.first_name || existingMeta.firstName || '';
          const curLastName = existing.last_name || existingMeta.lastName || '';
          const curDesignation = existing.designation || existingMeta.designation || '';
          const curContactNo = existing.contact_no || existingMeta.contactNo || '';
          const curCompany = existing.company || existingMeta.company || '';

          const patch: any = {};
          const patchMeta: any = {};

          if (l.first_name && l.first_name !== curFirstName) {
            patch.first_name = l.first_name;
            patchMeta.firstName = l.first_name;
          }
          if (l.last_name && l.last_name !== curLastName) {
            patch.last_name = l.last_name;
            patchMeta.lastName = l.last_name;
          }
          if (l.designation && l.designation !== curDesignation) {
            patch.designation = l.designation;
            patchMeta.designation = l.designation;
          }
          if (l.contact_no && l.contact_no !== curContactNo) {
            patch.contact_no = l.contact_no;
            patchMeta.contactNo = l.contact_no;
          }
          if (l.company && l.company !== curCompany) {
            patch.company = l.company;
            patchMeta.company = l.company;
          }
          if (l.brand && l.brand !== existing.brand) {
            patch.brand = l.brand;
          }
          if (l.owner_id && l.owner_id !== existing.owner_id) {
            patch.owner_id = l.owner_id;
          }
          if (l.lead_source && l.lead_source !== existing.lead_source) {
            patch.lead_source = l.lead_source;
          }
          if (l.lead_stage && l.lead_stage !== existing.lead_stage) {
            patch.lead_stage = l.lead_stage;
          }
          if (l.lead_status && l.lead_status !== existing.lead_status) {
            patch.lead_status = l.lead_status;
          }
          if (l.comments && l.comments !== existing.comments) {
            patch.comments = l.comments;
          }

          if (Object.keys(patch).length > 0) {
            toUpdate.push({ id: existing.id, email: emailKey, patch, patchMeta });
          } else {
            // Unchanged duplicate — do not insert duplicate
            skippedCount++;
          }
        } else {
          // Brand new lead
          toInsert.push(l);
        }
      }

      // 1. Process updates for existing leads with changed data
      let updatedCount = 0;
      for (const item of toUpdate) {
        let { error: updateErr } = await supabase.from('leads').update(item.patch).eq('id', item.id);
        if (updateErr && (updateErr.code === 'PGRST204' || updateErr.message?.includes('column') || updateErr.message?.includes('company'))) {
          const fallbackPatch = { ...item.patch };
          delete fallbackPatch.first_name;
          delete fallbackPatch.last_name;
          delete fallbackPatch.designation;
          delete fallbackPatch.contact_no;
          if (updateErr.message?.includes('company')) delete fallbackPatch.company;
          if (Object.keys(fallbackPatch).length > 0) {
            await supabase.from('leads').update(fallbackPatch).eq('id', item.id);
          }
        }

        metaCache[item.id] = { ...(metaCache[item.id] || {}), ...item.patchMeta };
        metaCache[item.email] = metaCache[item.id];
        updatedCount++;
      }

      // 2. Process inserts for new leads
      let insertedCount = 0;
      if (toInsert.length > 0) {
        const insertData = toInsert.map(l => {
          return {
            first_name: l.first_name || null,
            last_name: l.last_name || null,
            designation: l.designation || null,
            contact_no: l.contact_no || null,
            email: l.email.toLowerCase(),
            company: l.company || null,
            brand: l.brand,
            owner_id: l.owner_id,
            lead_source: l.lead_source,
            lead_stage: l.lead_stage,
            lead_status: l.lead_status || 'New',
            comments: l.comments || undefined
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
          setError(error.message);
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

      // Friendly notification message detailing deduplication results
      let successMsg = '';
      if (insertedCount > 0 && updatedCount > 0) {
        successMsg = `Import completed: ${insertedCount} new leads added, ${updatedCount} existing leads updated with changed details, ${skippedCount} duplicates skipped.`;
      } else if (insertedCount > 0) {
        successMsg = `Import completed: ${insertedCount} new leads added${skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''}.`;
      } else if (updatedCount > 0) {
        successMsg = `Import completed: ${updatedCount} existing leads updated with new details${skippedCount > 0 ? ` (${skippedCount} unchanged duplicates skipped)` : ''}.`;
      } else {
        successMsg = `All ${skippedCount} leads already exist with identical details. No duplicate leads were added.`;
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

          {parsed.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
                Preview ({parsed.length} leads found)
              </h3>
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
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
                      return (
                        <tr key={idx}>
                          <td>{fullName || '—'}</td>
                          <td>{item.designation || '—'}</td>
                          <td>{item.contact_no || '—'}</td>
                          <td>{item.email}</td>
                          <td>{item.company || '—'}</td>
                          <td><strong>{item.brand}</strong></td>
                          <td>
                            <span className="role-tag admin" style={{ background: '#E0F2FE', color: '#0369A1' }}>
                              👤 {item.owner_name}
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
          )}
        </div>

        <div className="dr-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={handleImport} disabled={!parsed.length || busy}>
            {busy ? 'Importing…' : `Import & Allocate ${parsed.length} Leads`}
          </button>
        </div>
      </div>
    </>
  );
}
