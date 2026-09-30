export type Role = 'admin' | 'member';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at?: string;
}

export interface Lead {
  id: string;
  email: string;
  company?: string | null;
  brand: string;
  owner_id: string;
  lead_date: string;
  lead_source: string;
  lead_stage: string;
  connect_date: string | null;
  comments: string | null;
  followup2_date: string | null;
  followup2_comments: string | null;
  lead_status: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  lead_id: string | null;
  lead_owner_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: 'created' | 'updated' | 'deleted';
  company?: string | null;
  brand: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}
