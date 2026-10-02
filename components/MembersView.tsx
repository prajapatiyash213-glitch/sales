'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMember, inviteMember, resendMemberInvite, updateMember } from '@/app/admin/actions';
import { formatMemberName, initials } from '@/lib/format';
import type { Lead, Profile, Role } from '@/lib/types';
import { useToast } from './Toast';

export default function MembersView({ people, me, leads }: { people: Profile[]; me: Profile; leads: Lead[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [err, setErr] = useState('');

  function onInvite(e: FormEvent) {
    e.preventDefault();
    setErr('');
    start(async () => {
      const r = await inviteMember({ email, fullName: name, role, password });
      if (!r.ok) { setErr(r.message); return; }
      setEmail(''); setName(''); setPassword(''); setRole('member');
      toast.show(r.message);
      router.refresh();
    });
  }

  function resend(targetEmail: string) {
    start(async () => {
      const r = await resendMemberInvite(targetEmail);
      toast.show(r.message);
      if (r.ok) router.refresh();
    });
  }

  function remove(id: string, memberName: string) {
    if (!confirm(`Are you sure you want to delete ${memberName}? This will permanently remove their account and reassign their leads to you.`)) return;
    start(async () => {
      const r = await deleteMember(id);
      toast.show(r.message);
      if (r.ok) router.refresh();
    });
  }

  function change(id: string, patch: { role?: Role; active?: boolean }) {
    start(async () => {
      const r = await updateMember(id, patch);
      toast.show(r.message);
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      <div className="strip-head"><h2>Members</h2><span className="hint">Invite sales members and control who can sign in</span></div>

      <form className="panel" onSubmit={onInvite}>
        <strong>Add / Invite a member</strong>
        <p className="muted small">Set a password to create the account directly so they can sign in immediately, or leave it empty to send an email invite link.</p>
        {err && <div className="alert" role="alert">{err}</div>}
        <div className="invite-row">
          <label className="f">Full name<input value={name} onChange={e => setName(e.target.value)} placeholder="Riya Shah" required /></label>
          <label className="f">Work email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="riya@tecnoprism.com" required /></label>
          <label className="f">Password (optional)<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 chars" /></label>
          <label className="f">Role
            <select value={role} onChange={e => setRole(e.target.value as Role)}>
              <option value="member">Sales member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : (password ? 'Create member' : 'Send invite')}</button>
        </div>
      </form>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="members">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Leads</th><th>Access</th></tr></thead>
          <tbody>
            {people.map(p => {
              const nameText = formatMemberName(p);
              return (
                <tr key={p.id} className={p.active ? '' : 'inactive'}>
                  <td><span className="owner"><span className="avatar">{initials(nameText)}</span>{nameText}{p.id === me.id && <span className="muted"> (you)</span>}</span></td>
                  <td>{p.email}</td>
                <td>
                  <select value={p.role} disabled={pending || p.id === me.id} onChange={e => change(p.id, { role: e.target.value as Role })} aria-label={`Role for ${p.full_name}`}>
                    <option value="member">Sales member</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>{leads.filter(l => l.owner_id === p.id).length}</td>
                <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {p.id === me.id ? <span className="muted">Active</span> : (
                    <>
                      <button type="button" className="btn outline" disabled={pending} onClick={() => resend(p.email)}>
                        Resend invite
                      </button>
                      <button type="button" className="btn danger" disabled={pending} onClick={() => remove(p.id, p.full_name || p.email)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
      {toast.node}
    </>
  );
}
