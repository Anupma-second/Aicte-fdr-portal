"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { NavItem } from "@/lib/nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

const COLLAPSED_KEY = "aicte_sidebar_collapsed";

type PortalShellProps = {
  items: NavItem[];
  userName: string;
  userEmail: string;
  roleLabel: string;
  unreadCount: number;
  children: React.ReactNode;
};

export function PortalShell({ items, userName, userEmail, roleLabel, unreadCount, children }: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations("shell");

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Storage can be blocked; the sidebar simply starts expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
      } catch {
        // Not worth interrupting the user for a remembered preference.
      }
      return !current;
    });
  }

  return (
    <div className="bg-mesh flex min-h-dvh">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("skipToContent")}
      </a>
      <Sidebar
        items={items}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
          unreadCount={unreadCount}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
