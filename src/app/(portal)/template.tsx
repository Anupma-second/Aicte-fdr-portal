import { PageTransition } from "@/components/common/page-transition";

export default function PortalTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
