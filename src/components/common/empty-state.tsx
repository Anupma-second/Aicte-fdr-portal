import { FileSearch, type LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** True when this is the whole page, so its title is the page's main heading. */
  isPageTitle?: boolean;
};

export function EmptyState({ title, description, icon: Icon = FileSearch, isPageTitle = false }: EmptyStateProps) {
  const Title = isPageTitle ? "h1" : "p";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-7" aria-hidden />
      </span>
      <Title className="font-medium">{title}</Title>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
