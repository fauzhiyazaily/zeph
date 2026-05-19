"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Flag,
  LogOut,
  Menu,
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
  { href: "/transactions", label: "Transactions", Icon: Wallet },
  { href: "/budgets", label: "Budgets", Icon: CircleDollarSign },
  { href: "/goals", label: "Goals", Icon: Flag },
  { href: "/settings/privacy", label: "Settings", Icon: Settings },
] as const;

export function AppShell({ active, children }: AppShellProps) {
  const pathname = usePathname();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLElement>(null);

  // Read persisted collapse preference after mount
  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem("sidebar-collapsed") === "true") {
        setCollapsed(true);
      }
    } catch {
      // localStorage unavailable (SSR / private browsing) — use default
    }
  }, []);

  // Close overlay on route change
  useEffect(() => {
    setOverlayOpen(false);
  }, [pathname]);

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
    <div className={`app-shell${collapsed && mounted ? " sidebar-collapsed" : ""}`}>

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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed && mounted ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Theme toggle — hidden when collapsed */}
        {(!collapsed || !mounted) && (
          <div className="app-sidebar-theme-row">
            <ThemeToggle className="app-sidebar-theme-toggle" />
          </div>
        )}

        {/* Nav links */}
        <nav className="app-sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? "app-sidebar-link active" : "app-sidebar-link"}
              aria-current={isActive(href) ? "page" : undefined}
              title={collapsed && mounted ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {(!collapsed || !mounted) && <span>{label}</span>}
            </Link>
          ))}
        </nav>

        {/* Footer: theme icon (collapsed) + sign-out */}
        <div className="app-sidebar-footer">
          {collapsed && mounted && (
            <div className="app-sidebar-theme-collapsed">
              <ThemeToggle className="app-sidebar-theme-icon" />
            </div>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="app-sidebar-link app-sidebar-logout-btn"
              title={collapsed && mounted ? "Sign out" : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              {(!collapsed || !mounted) && <span>Sign out</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ════ Tablet top bar (768–1023px) ════ */}
      <header className="app-topbar">
        <button
          type="button"
          className="app-topbar-hamburger"
          onClick={() => setOverlayOpen(true)}
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
            onClick={() => setOverlayOpen(false)}
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
                onClick={() => setOverlayOpen(false)}
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
                  onClick={() => setOverlayOpen(false)}
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
