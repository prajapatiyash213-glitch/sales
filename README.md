# OmniScope Sales

Sales pipeline app for the OmniScope team.

- **Sales members** sign in and see only **their own leads**. They add and update leads directly in the app (list view, drag-and-drop board, mobile-friendly cards).
- **Admins** see **every member's leads**, team performance, the full activity log, and manage members (invite, promote, deactivate).
- Privacy is enforced **inside the database** with Supabase Row-Level Security, not just in the UI.
- Every add / edit / stage move / delete is recorded automatically in an activity log.
- Duplicate check across the whole team by email.
- Admin dashboard updates **live** when a member changes a lead.
- CSV export (Excel-ready).

**Lead fields:** Email, Brand, Ownership, Lead Date, Lead Source, Lead Stage, Date of Connect, Comments, Follow-up 2 Date, Comments (follow-up 2), Lead Status.

Stack: Next.js 14 (App Router) + Supabase (Postgres, Auth, Realtime) + Vercel.

---

## Setup (about 20 minutes)

### 1. Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project**. Pick region **South Asia (Mumbai)**.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**.

### 2. Lock down sign-ups (important)
**Authentication → Sign In / Providers → Email**
- Turn **OFF** "Allow new users to sign up". Only admins can add people (by invite).
- Keep "Confirm email" ON.

### 3. Set URLs
**Authentication → URL Configuration**
- **Site URL:** `https://YOUR-SALES-APP.vercel.app`
- **Redirect URLs:** add `https://YOUR-SALES-APP.vercel.app/**` and `http://localhost:3000/**`

### 4. Update two email templates
**Authentication → Emails → Templates**

**Invite user** — replace the link with:
```html
<h2>You have been invited to OmniScope Sales</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/account/set-password">Accept the invite and set your password</a></p>
```

**Reset password** — replace the link with:
```html
<h2>Reset your OmniScope Sales password</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/set-password">Set a new password</a></p>
```

> Tip: Supabase's built-in email sender is rate-limited (a few emails per hour). For a real team, add your own SMTP under **Authentication → Emails → SMTP Settings** (e.g. Google Workspace, Zoho, Resend, Brevo).

### 5. Create the first admin (you)
1. **Authentication → Users → Add user → Create new user**. Enter your email + a password, tick **Auto Confirm User**.
2. In **SQL Editor**, run (change the email and name):
   ```sql
   update public.profiles set role = 'admin', full_name = 'Your Name'
   where email = 'you@tecnoprism.com';
   ```

### 6. Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. Vercel → **Add New → Project** → import the repo.
3. Add **Environment Variables** (Supabase → Settings → API):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (**secret — server only**) |
   | `NEXT_PUBLIC_SITE_URL` | `https://YOUR-SALES-APP.vercel.app` |

4. **Deploy**. Then make sure the Site URL in step 3 matches the final domain.

### 7. Invite your team
Sign in → **Members** tab → enter name + email → **Send invite**. Each member gets an email, sets a password, and lands on their own sales workspace.

---

## Run locally
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

---

## How access works

| | Sales member | Admin |
|---|---|---|
| See leads | Own only | All |
| Add lead | Owned by self | Any owner |
| Edit lead | Own only | Any, can reassign |
| Delete lead | No | Yes |
| Activity log | Own leads (in lead editor) | Everything |
| Manage members | No | Yes |

These rules live in `supabase/schema.sql` (Row-Level Security policies), so they hold even if someone calls the API directly.

**Deactivating a member** blocks sign-in immediately and hides all data from them. Their leads stay; reassign them from the lead editor (Ownership field).

---

## Customising

- **Lead sources, stages, statuses:** `lib/constants.ts`. If you rename a stage or status, also update the matching `check (...)` lists in `supabase/schema.sql` and run this in the SQL editor, e.g.:
  ```sql
  alter table public.leads drop constraint leads_lead_stage_check;
  alter table public.leads add constraint leads_lead_stage_check
    check (lead_stage in ('New','Contacted','Meeting Scheduled','Proposal Sent','Negotiation','Won','Lost'));
  ```
- **Colours / fonts:** `app/globals.css` (tokens at the top, dark mode included).
- Won → status auto-set to **Converted**; Lost → **Dropped** (enforced in the database).

---

## Connecting to the OmniScope dashboard

This app uses the same Supabase project that OmniScope can read from. Two options:

1. **Quick:** add a "Sales pipeline" link/button in OmniScope pointing to `https://YOUR-SALES-APP.vercel.app/admin`.
2. **Full integration:** add Supabase login to OmniScope and read the `leads` table there with `@supabase/supabase-js`. An admin signed into OmniScope automatically gets all leads (same RLS rules), so pipeline numbers can sit next to the SEO charts.

---

## Project structure
```
app/
  login/, forgot-password/, account/set-password/   auth screens
  auth/confirm/        handles invite & reset links
  auth/signout/        sign out
  sales/               member workspace
  admin/               admin workspace + server actions (invite, roles, deactivate)
components/            Workspace (list/board/cards), LeadEditor, TeamView, ActivityView, MembersView
hooks/useLeads.ts      loads leads + live updates
lib/                   Supabase clients, constants, formatting, types
middleware.ts          session refresh + route protection
supabase/schema.sql    tables, RLS, triggers, activity log, duplicate check
```
