import { Eye, Scale, ShieldCheck, UserCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@voltedge/ui";

const principles = [
  {
    title: "Clear about AI",
    description:
      "You always know when wording was drafted with AI, and when you are reading official information.",
    icon: Eye,
  },
  {
    title: "People decide",
    description:
      "Sensitive and media-related responses are reviewed and approved by Stats SA before publication.",
    icon: UserCheck,
  },
  {
    title: "Traceable answers",
    description:
      "Every response points to the published documents behind it, so claims can be checked.",
    icon: ShieldCheck,
  },
  {
    title: "Fair and responsible",
    description: "Rafiki is designed with privacy, accuracy and accountability in mind.",
    icon: Scale,
  },
];

export function Governance() {
  return (
    <section id="governance" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Trust
          </p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Built to be trusted
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            AI should help people find official information, not replace the judgement behind it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((principle) => (
            <Card key={principle.title} size="sm">
              <CardHeader>
                <CardTitle>{principle.title}</CardTitle>
                <CardDescription>{principle.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                  <principle.icon className="size-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
