import type { ReactNode } from "react";

type SectionProps = {
  id: string;
  label: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function Section({ id, label, title, description, children }: SectionProps) {
  return (
    <section id={id} className="border-t border-border">
      <div className="grid gap-8 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-[200px_1fr] lg:gap-16 lg:px-14 lg:py-24">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <span className="font-mono text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {title}
            </h2>
            {description ? (
              <p className="leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
