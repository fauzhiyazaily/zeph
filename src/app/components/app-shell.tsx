"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumnBig,
  CircleDollarSign,
  Flag,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { ThemeToggle } from "./theme-toggle";

type AppShellProps = {
  active?: string;
  children: React.ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: ChartColumnBig },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/transactions", label: "Transactions", Icon: Wallet },
  { href: "/budgets", label: "Budgets", Icon: CircleDollarSign },
  { href: "/goals", label: "Goals", Icon: Flag },
  { href: "/settings/privacy", label: "Settings", Icon: Settings },
] as const;

export function AppShell({ active, children }: AppShellProps) {
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [overlayOpenForPath, setOverlayOpenForPath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const overlayRef = useRef<HTMLElement>(null);
  const currentPath = pathname ?? "";
  const overlayOpen = overlayOpenForPath === currentPath;

  // Trap focus within overlay sidebar when open
  useEffect(() => {
    if (overlayOpen) {
      overlayRef.current?.focus();
    }
  }, [overlayOpen]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isActive = (href: string) => {
    const current = active ?? pathname ?? "";
    return current === href || current.startsWith(href + "/");
  };

  return (
    <div className={`app-shell overflow-x-hidden${collapsed && mounted ? " sidebar-collapsed" : ""}`}>

      {/* ════ Desktop sidebar (≥1024px) ════ */}
      <aside className="app-sidebar" aria-label="Primary navigation">

        {/* Brand / logo */}
        <div className="app-sidebar-header">
          {collapsed && mounted ? (
            <div className="app-sidebar-brand-icon">
              <span className="app-logo-mark">Z</span>
            </div>
          ) : (
            <div className="app-sidebar-brand">
              <span className="app-logo-mark">Z</span>
              <div>
                <p className="app-brand-title">Zeph</p>
                <p className="app-brand-subtitle">Financial intelligence</p>
              </div>
            </div>
          )}
          <button
            type="button"
            className="app-sidebar-collapse-btn"
            onClick={toggleCollapse}
            aria-label={(mounted && collapsed) ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={mounted ? !collapsed : undefined}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="app-sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? "app-sidebar-link active" : "app-sidebar-link"}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={label}
              title={collapsed && mounted ? label : undefined}
              // ZEPH-FIX: data-tooltip drives CSS floating label in collapsed mode (issue 3)
              data-tooltip={collapsed && mounted ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!(mounted && collapsed) && <span>{label}</span>}
            </Link>
          ))}
        </nav>

        {/* ZEPH-FIX: theme toggle always in footer for consistent placement in both states (issue 8) */}
        <div className="app-sidebar-footer">
          {!(mounted && collapsed) ? (
            <div className="app-sidebar-theme-row">
              <ThemeToggle className="app-sidebar-theme-toggle" />
            </div>
          ) : (
            <div className="app-sidebar-theme-collapsed">
              <ThemeToggle className="app-sidebar-theme-icon" />
            </div>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="app-sidebar-link app-sidebar-logout-btn"
              title={collapsed && mounted ? "Sign out" : undefined}
              data-tooltip={collapsed && mounted ? "Sign out" : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!(mounted && collapsed) && <span>Sign out</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ════ Tablet top bar (768–1023px) ════ */}
      <header className="app-topbar">
        <button
          type="button"
          className="app-topbar-hamburger"
          onClick={() => setOverlayOpenForPath(currentPath)}
          aria-label="Open navigation"
          aria-expanded={overlayOpen}
          aria-controls="app-overlay-sidebar"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link href="/dashboard" className="app-topbar-brand" aria-label="Zeph home">
          <span className="app-logo-mark app-logo-mark-sm">Z</span>
          <span className="app-topbar-brand-name">Zeph</span>
        </Link>
        <div className="app-topbar-right">
          <ThemeToggle className="app-topbar-theme" />
        </div>
      </header>

      {/* ════ Tablet overlay sidebar ════ */}
      {overlayOpen && (
        <>
          <div
            className="app-overlay-backdrop"
            onClick={() => setOverlayOpenForPath(null)}
            aria-hidden="true"
          />
          <nav
            id="app-overlay-sidebar"
            ref={overlayRef}
            className="app-overlay-sidebar"
            aria-label="Navigation panel"
            tabIndex={-1}
          >
            <div className="app-overlay-header">
              <div className="app-sidebar-brand">
                <span className="app-logo-mark">Z</span>
                <div>
                  <p className="app-brand-title">Zeph</p>
                  <p className="app-brand-subtitle">Financial intelligence</p>
                </div>
              </div>
              <button
                type="button"
                className="app-overlay-close"
                onClick={() => setOverlayOpenForPath(null)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="app-sidebar-theme-row">
              <ThemeToggle className="app-sidebar-theme-toggle" />
            </div>

            <div className="app-overlay-nav">
              {navItems.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={isActive(href) ? "app-sidebar-link active" : "app-sidebar-link"}
                  aria-current={isActive(href) ? "page" : undefined}
                  onClick={() => setOverlayOpenForPath(null)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            <div className="app-sidebar-footer">
              <form action={signOut}>
                <button type="submit" className="app-sidebar-link app-sidebar-logout-btn">
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          </nav>
        </>
      )}

      {/* ════ Mobile bottom nav (<768px) ════ */}
      <nav className="app-bottom-nav" aria-label="Primary navigation">
        {navItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "app-bottom-nav-link active" : "app-bottom-nav-link"}
            aria-current={isActive(href) ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <div className="app-bottom-nav-theme">
          <ThemeToggle className="app-bottom-nav-theme-btn" />
        </div>
      </nav>

      {/* ════ Page content ════ */}
      {children}
    </div>
  );
}
