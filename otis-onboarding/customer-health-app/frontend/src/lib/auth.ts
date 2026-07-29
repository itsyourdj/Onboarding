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
export const DATAOS_FQDN =
  (import.meta.env?.VITE_DATAOS_FQDN as string | undefined)?.replace(/\/+$/, "") ||
  hostDefault;

// The exact key DataOS writes for the signed-in user's OIDC session.
const OIDC_KEY = `modern-oidc.user:${DATAOS_FQDN}/oidc:dataos_generic`;

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
}

function readSession(): OidcSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OIDC_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OidcSession;
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

  // Localhost development should remain usable without a DataOS browser session.
  // Keep strict auth only for deployed hosts.
  if (IS_DEV_HOST) return true;

  const s = readSession();
  if (!s) {
    console.warn(`[Pulse] Auth: no DataOS session at "${OIDC_KEY}".`);
    return false;
  }

  const expMs = typeof s.expires_at === "number" ? s.expires_at * 1000 : null;
  if (expMs !== null && expMs <= Date.now()) {
    console.warn("[Pulse] Auth: DataOS token has expired.");
    return false;
  }
  return true;
}

export function redirectToLogin(): void {
  // replace() so the unauthenticated view isn't left in browser history.
  window.location.replace(DATAOS_FQDN);
}
