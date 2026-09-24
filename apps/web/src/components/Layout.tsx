import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { api, ApiError } from '../lib/api.ts';
import { logout } from '../lib/auth.ts';
import { Loading } from './ui.tsx';

/** App shell for logged-in pages. Sends visitors without a valid session to /login. */
export function Layout() {
  const location = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });

  if (me.error instanceof ApiError && me.error.status === 401) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            Planza
          </Link>
          {me.data && (
            <div className="flex items-center gap-3 text-sm">
              <Link to="/profile" className="text-stone-600 hover:text-stone-900">
                {me.data.displayName}
              </Link>
              <button className="text-stone-400 hover:text-stone-700" onClick={logout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{me.data ? <Outlet /> : <Loading />}</main>
    </div>
  );
}
