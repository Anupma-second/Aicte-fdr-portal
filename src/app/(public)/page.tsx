import { CountdownDemo } from "@/components/landing/countdown-demo";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LifecycleExplorer } from "@/components/landing/lifecycle-explorer";
import { Navbar } from "@/components/landing/navbar";
import { RoleCards } from "@/components/landing/role-cards";
import { SecuritySection } from "@/components/landing/security-section";
import { TrackWidget } from "@/components/landing/track-widget";
import { getLandingData, optionalPhoto } from "@/lib/landing";

export default async function LandingPage() {
  const data = await getLandingData();

  return (
    <div className="bg-mesh min-h-dvh">
      <Navbar />
      <main>
        <Hero stats={data?.stats ?? null} photo={optionalPhoto("hero.jpg")} />
        <LifecycleExplorer />
        <TrackWidget samples={data?.sampleReferences ?? []} />
        <CountdownDemo />
        <Features />
        <HowItWorks />
        <RoleCards />
        {data && <DashboardPreview overview={data.overview} total={data.stats.fdrs} />}
        <SecuritySection />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
