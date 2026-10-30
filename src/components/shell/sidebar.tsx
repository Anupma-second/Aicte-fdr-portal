"use client";

import {
  Bell,
  CalendarDays,
  ChartColumn,
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NavIcon, NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  fdrs: FileText,
  calendar: CalendarDays,
  reports: ChartColumn,
  audit: ScrollText,
  notifications: Bell,
  users: Users,
};

type SidebarProps = {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({ items, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("shell.closeMenu")}
          className="fixed inset-0 z-30 bg-navy/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:w-[4.5rem]",
        )}
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <ShieldCheck className="size-7 shrink-0 text-gold" aria-hidden />
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-semibold text-white">{t("app.shortName")}</p>
            <p className="truncate text-xs text-sidebar-muted">{t("app.bureau")}</p>
          </div>
          <button
            type="button"
            aria-label={t("shell.closeMenu")}
            className="rounded-lg p-1 hover:bg-white/10 lg:hidden"
            onClick={onCloseMobile}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav aria-label={t("shell.mainNav")} className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            // The dashboard link shouldn't light up on pages nested under it, like /admin/users.
            const active = pathname === item.href || (item.icon !== "dashboard" && pathname.startsWith(`${item.href}/`));
            const label = t(`nav.${item.labelKey}`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                title={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-white/10",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className={cn("truncate", collapsed && "lg:sr-only")}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t(collapsed ? "shell.expandSidebar" : "shell.collapseSidebar")}
            aria-expanded={!collapsed}
            className={cn(
              "flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-sidebar-muted hover:bg-white/10",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            {!collapsed && <span>{t("shell.collapseSidebar")}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
