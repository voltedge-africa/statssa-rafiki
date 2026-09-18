import { Section } from "../components/section.tsx";

const principles = [
  {
    title: "Clear about AI",
    description:
      "You always know when wording was drafted with AI, and when you are reading official information.",
  },
  {
    title: "People decide",
    description:
      "Sensitive and media-related responses are reviewed and approved by Stats SA before publication.",
  },
  {
    title: "Traceable answers",
    description:
      "Every response points to the published documents behind it, so claims can be checked.",
  },
  {
    title: "Fair and responsible",
    description: "Rafiki is designed with privacy, accuracy and accountability in mind.",
  },
];

export function Governance() {
  return (
    <Section
      id="governance"
      label="trust"
      title="Built to be trusted"
      description="AI should help people find official information, not replace the judgement behind it."
    >
      <div className="flex flex-col">
        {principles.map((principle) => (
          <div
            key={principle.title}
            className="grid gap-2 border-t border-border py-5 sm:grid-cols-[220px_1fr] sm:gap-10"
          >
            <span className="font-medium">{principle.title}</span>
            <p className="max-w-[64ch] leading-relaxed text-muted-foreground">
              {principle.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
