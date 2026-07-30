// Client-side auth gate for the DataOS deployment.
//
// Before the app renders, we require that a DataOS OIDC session object is
// present AND not expired in localStorage. If it isn't, the user is sent to the
// DataOS FQDN to sign in. This runs on every full page load — whether the app
// is opened from the DataOS home card or via a direct URL — because it's
// invoked from the app's boot gate (see SplashScreen.tsx), which mounts before
// any route. While the app is open, the expiry is also watched live so the user
// is redirected the moment the token expires (mirroring DataOS itself).
//
// NOTE: this is UX-level gating only. It keeps unauthenticated users out of the
// UI, but is bypassable client-side; real network enforcement is the DataOS
// gateway/ingress in front of the app.

// Where unauthenticated users are sent to sign in. Defaults to the current host
// so the same build works across environments without hardcoded domains.
const hostDefault =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "https://clienttech.instance.dataos.cloud";
const configuredDataos =
  (import.meta.env?.VITE_DATAOS_FQDN as string | undefined)?.replace(/\/+$/, "") || "";
let resolvedDataosFqdn = configuredDataos || hostDefault;

// The exact key DataOS writes for the signed-in user's OIDC session.
let oidcKey = `modern-oidc.user:${resolvedDataosFqdn}/oidc:dataos_generic`;

// Dev host = Vite dev server or a localhost origin. ONLY on a dev host do we
// expose a "stop redirect" control (so a token can be pasted manually). The
// deployed build is served from the DataOS FQDN, so this is false there and the
// redirect is strict/unstoppable.
export const IS_DEV_HOST =
  (import.meta.env?.DEV ?? false) ||
  (typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname));

interface OidcSession {
  expires_at?: number; // epoch SECONDS (oidc-client convention)
  access_token?: string;
}

function readSession(): OidcSession | null {
  if (typeof window === "undefined") return null;
  const candidateKeys = new Set<string>([oidcKey]);
  // Fallback for local dev where the deployment host session may be present.
  if (IS_DEV_HOST) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("modern-oidc.user:") && k.endsWith("/oidc:dataos_generic")) {
        candidateKeys.add(k);
      }
    }
  }
  try {
    for (const key of candidateKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as OidcSession;
      oidcKey = key;
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn("[Pulse] Auth: failed to parse session object —", err);
    return null;
  }
}

// The session's expiry as epoch MILLISECONDS, or null if there's no session /
// no expiry field. Used to schedule a live redirect the instant it expires.
export function getExpiryMs(): number | null {
  const s = readSession();
  if (s && typeof s.expires_at === "number") return s.expires_at * 1000;
  return null;
}

export function isAuthenticated(): boolean {
  // No DOM (SSR/build) — don't block rendering.
  if (typeof window === "undefined") return true;

  const s = readSession();
  if (!s) {
    console.warn(`[Pulse] Auth: no DataOS session at "${oidcKey}".`);
    return false;
  }

  const expMs = typeof s.expires_at === "number" ? s.expires_at * 1000 : null;
  if (expMs !== null && expMs <= Date.now()) {
    console.warn("[Pulse] Auth: DataOS token has expired.");
    return false;
  }
  return true;
}

export function getAccessToken(): string | null {
  const s = readSession();
  return typeof s?.access_token === "string" && s.access_token.trim() ? s.access_token.trim() : null;
}

async function resolveLoginUrl(): Promise<string> {
  if (typeof window === "undefined") return resolvedDataosFqdn;
  if (configuredDataos) return configuredDataos;
  if (!IS_DEV_HOST) return resolvedDataosFqdn;

  try {
    const apiBase = new URL("api", document.baseURI).toString().replace(/\/+$/, "");
    const response = await fetch(`${apiBase}/auth/context`, { method: "GET" });
    if (response.ok) {
      const body = (await response.json()) as { loginUrl?: string | null };
      if (body?.loginUrl) {
        resolvedDataosFqdn = String(body.loginUrl).replace(/\/+$/, "");
      }
    }
  } catch (err) {
    console.warn("[Pulse] Auth: failed to fetch login context, using fallback.", err);
  }
  return resolvedDataosFqdn;
}

export async function redirectToLogin(): Promise<void> {
  // replace() so the unauthenticated view isn't left in browser history.
  const target = await resolveLoginUrl();
  window.location.replace(target);
}
