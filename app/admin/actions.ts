'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/lib/types';

type Result = { ok: boolean; message: string };

async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Your session has ended. Sign in again.');
  const { data } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!data || data.role !== 'admin' || !data.active) throw new Error('Only admins can manage members.');
  return user.id;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteMember(input: { email: string; fullName: string; role: Role }): Promise<Result> {
  try {
    await assertAdmin();
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    const role: Role = input.role === 'admin' ? 'admin' : 'member';
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Enter a valid email address.' };
    if (!fullName) return { ok: false, message: 'Enter the member\u2019s full name.' };

    const admin = createAdminClient();
    let site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!site || site.includes('localhost')) {
      site = 'https://sales-hazel-ten.vercel.app';
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${site}/account/set-password`
    });
    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        const { error: resendErr } = await admin.auth.resetPasswordForEmail(email, {
          redirectTo: `${site}/account/set-password`
        });
        if (resendErr) return { ok: false, message: resendErr.message };
        return { ok: true, message: `Fresh invitation email sent to ${email}` };
      }
      return { ok: false, message: error.message };
    }
    if (data.user) {
      await admin.from('profiles').update({ full_name: fullName, role }).eq('id', data.user.id);
    }
    revalidatePath('/admin');
    return { ok: true, message: `Invite sent to ${email}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function resendMemberInvite(email: string): Promise<Result> {
  try {
    await assertAdmin();
    const cleanEmail = email.trim().toLowerCase();
    const admin = createAdminClient();
    let site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!site || site.includes('localhost')) {
      site = 'https://sales-hazel-ten.vercel.app';
    }

    const { error } = await admin.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${site}/account/set-password`
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Fresh invitation email sent to ${cleanEmail}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function updateMember(id: string, patch: { role?: Role; active?: boolean; full_name?: string }): Promise<Result> {
  try {
    const me = await assertAdmin();
    if (id === me && (patch.role === 'member' || patch.active === false)) {
      return { ok: false, message: 'You cannot remove your own admin access. Ask another admin.' };
    }
    const clean: { role?: Role; active?: boolean; full_name?: string } = {};
    if (patch.role) clean.role = patch.role === 'admin' ? 'admin' : 'member';
    if (typeof patch.active === 'boolean') clean.active = patch.active;
    if (typeof patch.full_name === 'string' && patch.full_name.trim()) clean.full_name = patch.full_name.trim();

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update(clean).eq('id', id);
    if (error) return { ok: false, message: error.message };

    if (typeof clean.active === 'boolean') {
      // Block or restore sign-in at the auth level too
      await admin.auth.admin.updateUserById(id, { ban_duration: clean.active ? 'none' : '876000h' });
    }
    revalidatePath('/admin');
    return { ok: true, message: 'Member updated' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteMember(id: string): Promise<Result> {
  try {
    const me = await assertAdmin();
    if (id === me) {
      return { ok: false, message: 'You cannot delete your own admin account.' };
    }

    const admin = createAdminClient();

    // 1. Reassign leads owned by this member to the current admin
    await admin.from('leads').update({ owner_id: me }).eq('owner_id', id);

    // 2. Delete profile from 'profiles' table
    const { error: profileErr } = await admin.from('profiles').delete().eq('id', id);
    if (profileErr) return { ok: false, message: profileErr.message };

    // 3. Delete user from Supabase Auth
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr && !authErr.message?.includes('not found')) {
      return { ok: false, message: authErr.message };
    }

    revalidatePath('/admin');
    return { ok: true, message: 'Member deleted permanently' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
