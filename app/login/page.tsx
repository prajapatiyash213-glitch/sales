import LoginForm from './LoginForm';

const NOTICES: Record<string, string> = {
  inactive: 'Your account has been deactivated. Ask your admin to turn it back on.',
  link: 'That link has expired or was already used. Request a new one below.'
};

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return <LoginForm next={searchParams.next} notice={searchParams.error ? NOTICES[searchParams.error] : undefined} />;
}
