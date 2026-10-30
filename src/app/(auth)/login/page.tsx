import { Suspense } from "react";
import { LoginForm } from "./login-form";

// Seeded demo logins. Only sent to the browser in development.
const DEMO_ACCOUNTS = [
  { role: "INSTITUTION", email: "institution@demo.test" },
  { role: "SCRUTINY_OFFICER", email: "officer@demo.test" },
  { role: "COMPETENT_AUTHORITY", email: "authority@demo.test" },
  { role: "ADMIN", email: "admin@demo.test" },
] as const;

export default function LoginPage() {
  const isDevelopment = process.env.NODE_ENV === "development";
  return (
    <Suspense>
      <LoginForm demo={isDevelopment ? { accounts: DEMO_ACCOUNTS, password: "Demo@12345" } : null} />
    </Suspense>
  );
}
