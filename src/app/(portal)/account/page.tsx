import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requirePageRole();
  const t = await getTranslations("account");
  const tRoles = await getTranslations("roles");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm break-all text-muted-foreground">{user.name} · {user.email} · {tRoles(user.role)}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
          <CardDescription>{t("passwordHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
