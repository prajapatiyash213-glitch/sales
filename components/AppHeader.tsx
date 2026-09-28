import type { Profile } from '@/lib/types';
import { initials } from '@/lib/format';

export default function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <div className="brand">
          <span className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">OmniScope</span>
        </div>
        <div className="me">
          <span className="avatar">{initials(profile.full_name || profile.email)}</span>
          <span className="name">{profile.full_name || profile.email}</span>
          <span className={`role-tag ${profile.role}`}>{profile.role === 'admin' ? 'Admin' : 'Sales'}</span>
          <form action="/auth/signout" method="post">
            <button className="btn logout-btn" type="submit">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
