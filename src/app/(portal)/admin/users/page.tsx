import { Role, UserStatus, type Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { CreateStaffForm, UserRowActions } from "@/components/common/user-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { cn, formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;
const SELECT = "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

const STATUS_STYLE: Record<UserStatus, string> = {
  ACTIVE: "bg-status-green-bg text-status-green",
  PENDING_APPROVAL: "bg-status-amber-bg text-status-amber",
  SUSPENDED: "bg-status-red-bg text-status-red",
  REJECTED: "bg-status-grey-bg text-status-grey",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePageRole("ADMIN");
  const params = await searchParams;
  const t = await getTranslations("admin");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();

  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const role = Object.values(Role).includes(params.role as Role) ? (params.role as Role) : "";
  const status = Object.values(UserStatus).includes(params.status as UserStatus) ? (params.status as UserStatus) : "";
  const pageNumber = Number(params.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { institution: { name: { contains: q } } }] } : {}),
  };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ role: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { institution: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (role) query.set("role", role);
    if (status) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    return `/admin/users?${query}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("usersTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("usersCount", { count: total })}</p>
      </div>

      <CreateStaffForm />

      <Card className="p-4">
        <form method="get" action="/admin/users" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto_auto] xl:items-end">
          <div className="space-y-1">
            <label htmlFor="q" className="text-xs font-medium">{t("search")}</label>
            <Input id="q" name="q" type="search" defaultValue={q} />
          </div>
          <div className="space-y-1">
            <label htmlFor="role" className="text-xs font-medium">{t("role")}</label>
            <select id="role" name="role" defaultValue={role} className={SELECT}>
              <option value="">{t("all")}</option>
              {Object.values(Role).map((value) => <option key={value} value={value}>{tRoles(value)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="status" className="text-xs font-medium">{t("status")}</label>
            <select id="status" name="status" defaultValue={status} className={SELECT}>
              <option value="">{t("all")}</option>
              {Object.values(UserStatus).map((value) => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}
            </select>
          </div>
          <Button type="submit">{t("apply")}</Button>
          <Button asChild variant="ghost"><Link href="/admin/users">{t("clear")}</Link></Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={Users} title={t("usersEmpty")} />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {["name", "role", "status", "lastLogin"].map((column) => (
                    <th key={column} scope="col" className="sticky top-0 z-10 bg-card px-4 py-3 font-medium">{t(column)}</th>
                  ))}
                  <th scope="col" className="sticky top-0 z-10 bg-card px-4 py-3 text-right font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="max-w-72 px-4 py-3">
                      <p className="truncate font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      {user.institution && <p className="truncate text-xs text-muted-foreground">{user.institution.name}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{tRoles(user.role)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_STYLE[user.status])}>{t(`statuses.${user.status}`)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : t("never")}</td>
                    <td className="px-4 py-3"><UserRowActions userId={user.id} role={user.role} status={user.status} isSelf={user.id === admin.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}><ChevronLeft />{t("previous")}</Link></Button> : <span />}
          <span className="text-muted-foreground">{t("page", { page, pages })}</span>
          {page < pages ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>{t("next")}<ChevronRight /></Link></Button> : <span />}
        </nav>
      )}
    </div>
  );
}
