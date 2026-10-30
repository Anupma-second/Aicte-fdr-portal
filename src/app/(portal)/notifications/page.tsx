import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { NotificationList } from "@/components/common/notification-list";
import { Card } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";

const LIMIT = 100;

export default async function NotificationsPage() {
  const user = await requirePageRole();
  const t = await getTranslations("notifications");
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: LIMIT }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("unreadCount", { count: unread })}</p>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title={t("empty")} description={t("emptyHint")} />
        </Card>
      ) : (
        <NotificationList
          unread={unread}
          items={items.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            body: item.body,
            link: item.link,
            read: item.readAt !== null,
            createdAt: item.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
