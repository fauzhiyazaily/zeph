import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { ThemeToggle } from "./theme-toggle";
import {
  ChartColumnBig,
  CircleDollarSign,
  Flag,
  LogOut,
  Menu,
  Settings,
  Wallet,
} from "lucide-react";

type MobileFinanceNavProps = {
  active:
    | "/dashboard"
    | "/transactions"
    | "/budgets"
    | "/goals"
    | "/settings/privacy";
};

type NavItem = {
  href: MobileFinanceNavProps["active"];
  label: string;
  icon: "dashboard" | "transactions" | "budgets" | "goals" | "settings";
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transactions", icon: "transactions" },
  { href: "/budgets", label: "Budgets", icon: "budgets" },
  { href: "/goals", label: "Goals", icon: "goals" },
  { href: "/settings/privacy", label: "Settings", icon: "settings" },
];

function NavIcon({ type }: { type: NavItem["icon"] }) {
  if (type === "dashboard") {
    return <ChartColumnBig aria-hidden="true" className="h-4 w-4" />;
  }

  if (type === "transactions") {
    return <Wallet aria-hidden="true" className="h-4 w-4" />;
  }

  if (type === "budgets") {
    return <CircleDollarSign aria-hidden="true" className="h-4 w-4" />;
  }

  if (type === "goals") {
    return <Flag aria-hidden="true" className="h-4 w-4" />;
  }

  return <Settings aria-hidden="true" className="h-4 w-4" />;
}

export function MobileFinanceNav({ active }: MobileFinanceNavProps) {
  return (
    <>
      {/* Tablet dropdown (640px–1023px) — visibility controlled via CSS */}
      <details className="finance-mobile-sidebar">
        <summary className="finance-mobile-sidebar-trigger">
          <span className="inline-flex items-center gap-2">
            <Menu aria-hidden="true" className="h-4 w-4" />
            Navigation
          </span>
        </summary>
        <div className="finance-mobile-sidebar-panel">
          <div className="finance-sidebar-brand">
            <span className="finance-logo-mark">Z</span>
            <div>
              <p className="finance-brand-title">Zeph</p>
              <p className="finance-brand-subtitle">Financial intelligence</p>
            </div>
          </div>
          <div className="finance-sidebar-theme-row">
            <ThemeToggle className="finance-sidebar-theme-toggle" />
          </div>
          <nav aria-label="Primary mobile navigation" className="finance-sidebar-nav">
            {navItems.map((item) => {
              const isActive = item.href === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive ? "finance-sidebar-link active" : "finance-sidebar-link"}
                >
                  <NavIcon type={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <form action={signOut} className="finance-sidebar-logout">
            <button type="submit" className="finance-sidebar-link finance-sidebar-logout-button">
              <LogOut aria-hidden="true" className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </form>
        </div>
      </details>

      {/* Mobile bottom navigation bar (< 640px) — visibility controlled via CSS */}
      <nav aria-label="Primary mobile navigation" className="finance-bottom-nav">
        {navItems.map((item) => {
          const isActive = item.href === active;
          return (
            <Link
              key={`bottom-${item.href}`}
              href={item.href}
              className={isActive ? "finance-bottom-nav-link active" : "finance-bottom-nav-link"}
              aria-current={isActive ? "page" : undefined}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="finance-bottom-nav-theme-slot">
          <ThemeToggle className="finance-bottom-nav-theme-toggle" />
        </div>
      </nav>

      <aside aria-label="Primary desktop navigation" className="finance-sidebar">
        <div className="finance-sidebar-brand">
          <span className="finance-logo-mark">Z</span>
          <div>
            <p className="finance-brand-title">Zeph</p>
            <p className="finance-brand-subtitle">Financial intelligence</p>
          </div>
        </div>

        <div className="finance-sidebar-theme-row">
          <ThemeToggle className="finance-sidebar-theme-toggle" />
        </div>

        <nav className="finance-sidebar-nav">
          {navItems.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={`desktop-${item.href}`}
                href={item.href}
                className={isActive ? "finance-sidebar-link active" : "finance-sidebar-link"}
              >
                <NavIcon type={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <form action={signOut} className="finance-sidebar-logout">
          <button type="submit" className="finance-sidebar-link finance-sidebar-logout-button">
            <LogOut aria-hidden="true" className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </form>
      </aside>

    </>
  );
}
