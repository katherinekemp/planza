// Everything the app needs to know about login lives here.
//  - dev:     type any email (local development only)
//  - cognito: OAuth 2.0 authorization code flow with PKCE via Cognito's hosted login page
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const DEV_KEY = 'planza.devEmail';

export const authMode = (import.meta.env.VITE_AUTH_MODE ?? 'cognito') as 'dev' | 'cognito';

const cognito =
  authMode === 'cognito'
    ? new UserManager({
        authority: import.meta.env.VITE_COGNITO_AUTHORITY,
        client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
        redirect_uri: `${window.location.origin}/auth/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        // Keep the session across tabs and browser restarts (refresh tokens last 30 days).
        userStore: new WebStorageStateStore({ store: window.localStorage }),
        automaticSilentRenew: true,
      })
    : null;

/** The bearer token for API calls, or null if not logged in. Refreshes expired tokens. */
export async function getToken(): Promise<string | null> {
  if (!cognito) {
    const email = localStorage.getItem(DEV_KEY);
    return email ? `dev:${email}` : null;
  }
  let user = await cognito.getUser();
  if (user?.expired) {
    user = await cognito.signinSilent().catch(() => null);
  }
  return user?.id_token ?? null;
}

export function devLogin(email: string) {
  localStorage.setItem(DEV_KEY, email.trim().toLowerCase());
}

/** Sends the browser to Cognito's login page. `next` is where to return afterward. */
export function login(next: string) {
  return cognito!.signinRedirect({ state: { next } });
}

// React StrictMode runs effects twice in development; the one-time code can only be exchanged once.
let callbackPromise: Promise<string> | null = null;

/** Finishes login on /auth/callback. Returns the path to continue to. */
export function completeLogin(): Promise<string> {
  callbackPromise ??= cognito!
    .signinRedirectCallback()
    .then((user) => (user.state as { next?: string } | undefined)?.next ?? '/');
  return callbackPromise;
}

export async function logout() {
  if (!cognito) {
    localStorage.removeItem(DEV_KEY);
    window.location.href = '/login';
    return;
  }
  await cognito.removeUser();
  // Also end the session on Cognito's side, or the next login would skip the password.
  const url = new URL('/logout', import.meta.env.VITE_COGNITO_DOMAIN);
  url.searchParams.set('client_id', import.meta.env.VITE_COGNITO_CLIENT_ID);
  url.searchParams.set('logout_uri', `${window.location.origin}/`);
  window.location.href = url.toString();
}
