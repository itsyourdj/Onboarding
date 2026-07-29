import { useEffect, useState, type ReactNode } from "react";
import { getExpiryMs, isAuthenticated, redirectToLogin, IS_DEV_HOST } from "../lib/auth";

// Session-scoped so the splash shows once when the app is opened, but NOT
// on a refresh within the same tab session. sessionStorage survives reloads
// and is cleared when the tab/window closes — exactly the desired behaviour.
const SESSION_KEY = "pulse.splashShown";
const DURATION_MS = 3000;

// How long the "not signed in" notice is shown before we redirect to DataOS.
const REDIRECT_SECONDS = 6;

// Objects we hydrate from localStorage on boot. Logged to the console so it's
// clear what the app is reading during startup.
const BOOT_KEYS = ["userInfo", "ch-theme", "ch.sidebar"] as const;

function fetchBootObjects(): Record<string, unknown> {
  console.log(
    "%c[Pulse] Starting up — fetching session objects from localStorage…",
    "color:#009293;font-weight:600"
  );
  const collected: Record<string, unknown> = {};
  for (const key of BOOT_KEYS) {
    const raw = localStorage.getItem(key);
    let value: unknown = raw;
    if (raw != null) {
      try {
        value = JSON.parse(raw);
      } catch {
        /* plain (non-JSON) string value */
      }
    }
    collected[key] = value ?? null;
    console.log(`[Pulse] ↳ fetched "${key}":`, value ?? "(not set)");
  }
  console.log("%c[Pulse] Session objects ready.", "color:#009293;font-weight:600", collected);
  return collected;
}

export function BootGate({ children }: { children: ReactNode }) {
  // Auth is checked synchronously (localStorage is instant), so there's never a
  // separate "checking auth" screen — the single Pulse splash covers both the
  // auth check and the boot. Unauthenticated users get the same splash shell
  // with a redirect notice instead of the app.
  const [authed] = useState<boolean>(() => isAuthenticated());
  const [ready, setReady] = useState<boolean>(
    () =>
      authed &&
      typeof window !== "undefined" &&
      sessionStorage.getItem(SESSION_KEY) === "1"
  );

  useEffect(() => {
    if (!authed || ready) return;
    fetchBootObjects();
    const t = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      setReady(true);
    }, DURATION_MS);
    return () => clearTimeout(t);
  }, [authed, ready]);

  if (!authed) return <AuthRedirectSplash reason="signed-out" />;

  // Authenticated: render the app, but keep watching the token so we redirect
  // the instant it expires (matching DataOS), not only on the next reload.
  return <AuthExpiryGuard>{ready ? <>{children}</> : <Splash />}</AuthExpiryGuard>;
}

// Watches the live OIDC expiry. When the token's expiry moment arrives, it
// swaps the app out for the redirect splash — immediately, while the app is open.
function AuthExpiryGuard({ children }: { children: ReactNode }) {
  const [expired, setExpired] = useState<boolean>(false);

  useEffect(() => {
    const expMs = getExpiryMs();
    if (expMs === null) return; // no expiry to watch
    const delay = expMs - Date.now();
    if (delay <= 0) {
      setExpired(true);
      return;
    }
    console.log(
      `%c[Pulse] Auth: session valid for ${Math.round(delay / 1000)}s — watching for expiry.`,
      "color:#009293;font-weight:600"
    );
    const t = setTimeout(() => {
      console.warn("[Pulse] Auth: token just expired — redirecting.");
      setExpired(true);
    }, delay);
    return () => clearTimeout(t);
  }, []);

  if (expired) return <AuthRedirectSplash reason="expired" />;
  return <>{children}</>;
}

// Shared splash layout so the authenticated boot screen and the redirect notice
// look identical — only the status text, progress timing, and actions differ.
function SplashShell({
  subtitle,
  footer,
  progressMs,
  progressEasing = "ease-in-out",
  showProgress = true,
  action,
}: {
  subtitle: string;
  footer: ReactNode;
  progressMs: number;
  progressEasing?: string;
  showProgress?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      data-app-root
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg-primary text-fg-primary"
    >
      <div className="flex flex-col items-center animate-fade-in">
        <img
          // Relative so it resolves against <base href> (e.g. /pulse/) after deploy.
          src="app-icon.png"
          alt="Pulse"
          className="h-20 w-20 rounded-2xl shadow-[0_12px_34px_rgba(0,146,147,0.35)]"
          style={{ animation: "boot-bob 2.4s ease-in-out infinite" }}
        />
        <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">Pulse</h1>
        <p className="mt-1.5 text-sm text-fg-secondary">{subtitle}</p>
        {showProgress && (
          <div className="mt-9 h-1 w-56 overflow-hidden rounded-pill bg-bg-secondary">
            <div
              className="h-full rounded-pill bg-action-primary"
              style={{ animation: `boot-progress ${progressMs}ms ${progressEasing} forwards` }}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-fg-secondary">{footer}</p>
        {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
      </div>
    </div>
  );
}

function Splash() {
  return (
    <SplashShell
      subtitle="Customer health intelligence"
      footer="Loading your workspace…"
      progressMs={DURATION_MS}
    />
  );
}

function AuthRedirectSplash({ reason }: { reason: "signed-out" | "expired" }) {
  const [secs, setSecs] = useState<number>(REDIRECT_SECONDS);
  // Dev-only escape hatch: pause the redirect so a fresh token can be pasted.
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    if (paused) return;
    console.warn(
      reason === "expired"
        ? "[Pulse] Auth: session expired — redirecting to sign in."
        : "[Pulse] Auth: not signed in — redirecting to sign in."
    );
    const tick = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    const t = setTimeout(redirectToLogin, REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(t);
    };
  }, [paused, reason]);

  const subtitle =
    reason === "expired" ? "Your DataOS session has expired" : "You're not signed in to DataOS";

  const footer = paused
    ? "Redirect paused (dev) — paste a valid token, then reload."
    : `Redirecting you to sign in… (${secs}s)`;

  // The stop/reload controls are ONLY rendered on a dev host. In the deployed
  // build (served from the DataOS FQDN) IS_DEV_HOST is false → strict redirect.
  const action = IS_DEV_HOST ? (
    paused ? (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Reload app
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setPaused(true)}
        className="rounded-lg border border-divider bg-bg-elevated px-4 py-2 text-sm font-medium text-fg-primary transition hover:opacity-80"
      >
        Stop redirect (dev)
      </button>
    )
  ) : undefined;

  return (
    <SplashShell
      subtitle={subtitle}
      footer={footer}
      progressMs={REDIRECT_SECONDS * 1000}
      progressEasing="linear"
      showProgress={!paused}
      action={action}
    />
  );
}
