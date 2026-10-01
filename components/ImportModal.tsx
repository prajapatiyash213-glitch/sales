'use client';
import { useState, type ChangeEvent } from 'react';
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
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  async function handleImport() {
    if (!parsed.length) return;
    setBusy(true);
    setError('');

    try {
      const supabase = createClient();
      const insertData = parsed.map(l => {
        return {
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

      let { error } = await supabase.from('leads').insert(insertData);
      if (error && (error.code === 'PGRST204' || error.message?.includes('company'))) {
        const fallbackInsert = insertData.map(({ company, ...rest }) => rest);
        const retry = await supabase.from('leads').insert(fallbackInsert);
        error = retry.error;
      }

      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }

      toast.show(`Successfully imported & allocated ${parsed.length} leads!`);
      await reload();
      setBusy(false);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

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

          <div style={{ background: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 20 }}>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              style={{ width: '100%' }}
            />
            <div className="small muted" style={{ marginTop: 8 }}>
              Supported columns: <b>Email, Company, Brand, Ownership / Sales Member, Source, Stage</b>
            </div>
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
                      <th>Email</th>
                      <th>Company</th>
                      <th>Brand</th>
                      <th>Allocated To</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((item, idx) => (
                      <tr key={idx}>
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
                    ))}
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
