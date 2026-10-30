import { getTranslations } from "next-intl/server";
import { PortalShell } from "@/components/shell/portal-shell";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { navForRole } from "@/lib/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole();
  const t = await getTranslations("roles");
  const unreadCount = await db.notification.count({ where: { userId: user.id, readAt: null } });

  return (
    <PortalShell
      items={navForRole(user.role)}
      userName={user.name}
      userEmail={user.email}
      roleLabel={t(user.role)}
      unreadCount={unreadCount}
    >
      {children}
    </PortalShell>
  );
}
