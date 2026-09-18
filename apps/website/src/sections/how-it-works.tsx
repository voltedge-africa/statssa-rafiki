import { Section } from "../components/section.tsx";

const steps = [
  {
    title: "You ask",
    body: "A question in plain language, about anything Stats SA publishes.",
  },
  {
    title: "Rafiki searches published sources",
    body: "Releases, datasets, publications and approved communication material. Nothing that is not already public.",
  },
  {
    title: "You get the answer with its sources",
    body: "Plain language, with the series codes and links behind every figure so you can check the numbers yourself.",
  },
  {
    title: "A person approves anything sensitive",
    body: "Media, complex and low-confidence questions are drafted and routed to a Stats SA communications official.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      label="how it works"
      title="From question to cited answer"
      description="Four steps, and a person in the loop before anything sensitive goes out."
    >
      <ol className="relative flex flex-col">
        <span aria-hidden="true" className="absolute top-3 bottom-3 left-[11px] w-px bg-border" />
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="grid grid-cols-[24px_1fr] gap-6 py-6 first:pt-1 last:pb-1"
          >
            <span className="z-10 mt-0.5 flex size-6 items-center justify-center bg-background font-mono text-[11px] text-muted-foreground ring-1 ring-border">
              {index + 1}
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="font-heading text-base font-medium">{step.title}</h3>
              <p className="max-w-[62ch] leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
