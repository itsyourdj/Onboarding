import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sun, Moon, LogOut, ChevronRight } from "lucide-react";
import { useTheme } from "../theme";

interface UserInfo {
  name?: string;
  email?: string;
  id?: string;
  avatar_base64?: string;
}

function readUserInfo(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("userInfo");
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  } catch {
    return null;
  }
}

function displayName(u: UserInfo | null): string {
  if (u?.name?.trim()) return u.name.trim();
  if (u?.email) {
    const local = u.email.split("@")[0];
    if (local)
      return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
  return "Account";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      style={{ height: size, width: size, fontSize: Math.round(size * 0.36) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-action-primary font-semibold leading-none text-white"
    >
      {initials(name)}
    </span>
  );
}

function ThemeSlider() {
  const { theme, setTheme } = useTheme();
  const offset = theme === "light" ? "translate-x-0" : "translate-x-7";
  const opts: { mode: "light" | "dark"; label: string; Icon: typeof Sun }[] = [
    { mode: "light", label: "Light", Icon: Sun },
    { mode: "dark", label: "Dark", Icon: Moon },
  ];
  return (
    <div
      className="relative inline-flex items-center rounded-pill bg-bg-secondary p-1"
      role="radiogroup"
      aria-label="Appearance"
    >
      <span
        aria-hidden
        className={`absolute left-1 top-1 h-7 w-7 rounded-pill bg-bg-elevated shadow ring-2 ring-action-primary transition-transform duration-300 ${offset}`}
      />
      {opts.map(({ mode, label, Icon }) => {
        const active = mode === theme;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(mode)}
            className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-pill transition-colors ${
              active ? "text-fg-primary" : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // When collapsed, the sidebar clips overflow (to drive its width
  // animation), so a panel opening inside it would be cut off. In that
  // case we portal the panel to <body> and anchor it just right of the rail.
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);

  const user = useMemo(() => readUserInfo(), []);
  const name = displayName(user);
  const email = user?.email ?? "";

  useLayoutEffect(() => {
    if (!open || !collapsed) return;
    const measure = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setCoords({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const panelBody = (
    <>
      <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
        <Avatar name={name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg-primary">{name}</p>
          {email && <p className="truncate text-xs text-fg-secondary">{email}</p>}
        </div>
      </div>
      <div className="px-2 py-2">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-fg-primary">
            <Sun size={17} className="text-fg-secondary" />
            Appearance
          </span>
          <ThemeSlider />
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-fg-primary transition-colors hover:bg-bg-secondary"
          onClick={() => {
            setOpen(false);
            window.location.href = "https://rc03iks-063026.dataos.cloud/";
          }}
        >
          <LogOut size={17} className="text-fg-secondary" />
          Sign out
        </button>
      </div>
    </>
  );

  const panel = collapsed
    ? createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          style={{
            position: "fixed",
            left: coords?.left ?? 0,
            bottom: coords?.bottom ?? 0,
            visibility: coords ? "visible" : "hidden",
          }}
          className="z-[60] w-72 overflow-hidden rounded-2xl border border-divider bg-bg-elevated shadow-modal"
        >
          {panelBody}
        </div>,
        document.body
      )
    : (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          className="absolute bottom-full left-3 right-3 z-50 mb-3 overflow-hidden rounded-2xl border border-divider bg-bg-elevated shadow-modal"
        >
          {panelBody}
        </div>
      );

  return (
    <div ref={rootRef} className="relative z-50 px-3 pb-3">
      {open && panel}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={collapsed ? name : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          collapsed
            ? "flex w-full items-center justify-center rounded-full transition-transform hover:scale-105"
            : "flex w-full items-center gap-3 rounded-2xl border border-divider bg-bg-elevated px-3 py-3 text-left shadow-[0_6px_20px_rgba(0,0,0,0.07)] transition-all hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
        }
      >
        <Avatar name={name} size={40} />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg-primary">{name}</span>
            {email && <span className="block truncate text-xs text-fg-secondary">{email}</span>}
          </span>
        )}
        {!collapsed && (
          <ChevronRight
            size={16}
            className={`shrink-0 text-fg-secondary transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        )}
      </button>
    </div>
  );
}
