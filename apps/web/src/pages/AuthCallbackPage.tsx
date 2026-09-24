import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { completeLogin } from '../lib/auth.ts';
import { ErrorText, Loading } from '../components/ui.tsx';

/** Cognito redirects here after login with a one-time code, which is exchanged for tokens. */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    completeLogin()
      .then((next) => navigate(next, { replace: true }))
      .catch(setError);
  }, [navigate]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      {error ? (
        <>
          <ErrorText error={error} />
          <a href="/login" className="mt-3 inline-block text-sm text-brand-600 underline">
            Try again
          </a>
        </>
      ) : (
        <Loading />
      )}
    </div>
  );
}
