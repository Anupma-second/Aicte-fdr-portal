"use client";

import { Bell, CircleUser, LogOut, Menu, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LocaleToggle } from "./locale-toggle";
import { ThemeToggle } from "./theme-toggle";

type TopBarProps = {
  userName: string;
  userEmail: string;
  roleLabel: string;
  unreadCount: number;
  onOpenMobileNav: () => void;
};

export function TopBar({ userName, userEmail, roleLabel, unreadCount, onOpenMobileNav }: TopBarProps) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [query, setQuery] = useState("");

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      toast.error(t("logoutFailed"));
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/fdrs?q=${encodeURIComponent(value)}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")} onClick={onOpenMobileNav}>
        <Menu />
      </Button>

      <form role="search" onSubmit={search} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button asChild variant="ghost" size="icon" className="sm:hidden">
          <Link href="/fdrs" aria-label={t("search")}>
            <Search />
          </Link>
        </Button>
        <LocaleToggle />
        <ThemeToggle />
        <Button asChild variant="ghost" size="icon" className="relative">
          <Link href="/notifications" aria-label={t("notificationsCount", { count: unreadCount })}>
            <Bell />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("profileMenu")}>
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UserRound className="size-4" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <p className="font-medium">{userName}</p>
              <p className="text-xs font-normal text-muted-foreground">{userEmail}</p>
              <p className="mt-1 text-xs font-normal text-muted-foreground">{roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/account")}>
              <CircleUser />
              {t("myAccount")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={logout}>
              <LogOut />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
