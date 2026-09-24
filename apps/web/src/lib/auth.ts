// Everything the app needs to know about login lives here, so switching from dev mode
// to Cognito only changes this file.

const DEV_KEY = 'planza.devEmail';

export const authMode = (import.meta.env.VITE_AUTH_MODE ?? 'cognito') as 'dev' | 'cognito';

export async function getToken(): Promise<string | null> {
  if (authMode === 'dev') {
    const email = localStorage.getItem(DEV_KEY);
    return email ? `dev:${email}` : null;
  }
  return null; // Cognito support is added in the auth step.
}

export function devLogin(email: string) {
  localStorage.setItem(DEV_KEY, email.trim().toLowerCase());
}

export async function logout() {
  localStorage.removeItem(DEV_KEY);
}
