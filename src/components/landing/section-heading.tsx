import { Reveal } from "@/components/common/reveal";

export function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      <p className="text-sm font-semibold tracking-wide text-accent-foreground">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground text-pretty">{subtitle}</p>
    </Reveal>
  );
}
