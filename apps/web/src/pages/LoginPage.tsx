import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { authMode, devLogin, login } from '../lib/auth.ts';
import { Button, Card, Input, Label } from '../components/ui.tsx';

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const next = params.get('next') ?? '/';

  function submitDev(e: FormEvent) {
    e.preventDefault();
    devLogin(email);
    navigate(next, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Planza</h1>
          <p className="text-sm text-stone-500">Casual plans with your people.</p>
        </div>
        <Card>
          {authMode === 'dev' ? (
            <form onSubmit={submitDev} className="space-y-3">
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                Dev mode: type any email to log in as that person.
              </p>
              <label className="block">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <Button type="submit" className="w-full">
                Log in
              </Button>
            </form>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-stone-600">
                Make plans with friends: post an idea, pick a date, see who's in.
              </p>
              <Button className="w-full" onClick={() => login(next)}>
                Log in or sign up
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
