import { BookOpenCheck, FileSearch, MessagesSquare, UserCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@voltedge/ui";

const steps = [
  {
    title: "Ask in your own words",
    description: "Type a question the way you would say it — no jargon or form fields.",
    icon: MessagesSquare,
  },
  {
    title: "Only published sources",
    description: "Rafiki looks through published Stats SA information, nothing else.",
    icon: BookOpenCheck,
  },
  {
    title: "Answers with references",
    description: "Responses are clear and plain-language, with the documents they came from.",
    icon: FileSearch,
  },
  {
    title: "People make the final call",
    description: "Anything sensitive or media-related is checked by Stats SA before it goes out.",
    icon: UserCheck,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            How it works
          </p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Simple to ask. Easy to verify.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Four steps from a question to an answer you can trust.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <Card key={step.title} size="sm">
              <CardHeader>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                  <step.icon className="size-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
