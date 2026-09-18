import { Section } from "../components/section.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voltedge/ui";

const groups = [
  {
    value: "ask",
    label: "Ask",
    summary:
      "Ask a question in your own words and get a clear answer from published Stats SA information.",
    capabilities: [
      {
        title: "Plain-language questions",
        description: "No jargon, no forms. Just ask.",
      },
      {
        title: "Published sources only",
        description: "Answers come from official releases, datasets and publications.",
      },
      {
        title: "Sources included",
        description: "Every answer points to the documents it used.",
      },
      {
        title: "Honest about gaps",
        description: "If there is no published answer, Rafiki says so.",
      },
    ],
  },
  {
    value: "media",
    label: "Media and statements",
    summary:
      "Prepare media queries and communication drafts from published information, ready for review.",
    capabilities: [
      {
        title: "Media queries",
        description: "Submit a query and get a prepared response to work from.",
      },
      {
        title: "Statements and FAQs",
        description: "Draft media statements, advisories and FAQs from published material.",
      },
      {
        title: "Audience ready",
        description: "Adapt the same information for media, public or digital channels.",
      },
      {
        title: "Always a draft",
        description: "Nothing goes out until a person has approved it.",
      },
    ],
  },
  {
    value: "consistency",
    label: "Consistency",
    summary:
      "Keep answers and messaging aligned, so the same question gets the same well-sourced answer.",
    capabilities: [
      {
        title: "Consistent answers",
        description: "Related questions draw on the same published sources.",
      },
      {
        title: "On-brand language",
        description: "Responses follow approved terminology and style.",
      },
      {
        title: "Reuse what works",
        description: "Previously published statements and FAQs are easy to find again.",
      },
      {
        title: "Faster responses",
        description: "Less time searching for the right document.",
      },
    ],
  },
];

export function Capabilities() {
  return (
    <Section
      id="capabilities"
      label="what you can ask"
      title="What Rafiki helps with"
      description="Public questions, media work and consistent messaging across the organisation."
    >
      <Tabs defaultValue="ask">
        <TabsList variant="line">
          {groups.map((group) => (
            <TabsTrigger key={group.value} value={group.value}>
              {group.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group.value} value={group.value}>
            <div className="flex flex-col gap-8 pt-6">
              <p className="max-w-2xl leading-relaxed text-muted-foreground">{group.summary}</p>
              <dl className="grid gap-x-16 sm:grid-cols-2">
                {group.capabilities.map((capability) => (
                  <div
                    key={capability.title}
                    className="flex flex-col gap-1.5 border-t border-border py-4"
                  >
                    <dt className="font-medium">{capability.title}</dt>
                    <dd className="text-sm leading-relaxed text-muted-foreground">
                      {capability.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}
