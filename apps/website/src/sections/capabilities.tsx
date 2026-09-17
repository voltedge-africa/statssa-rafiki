import { Check } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@voltedge/ui";

const groups = [
  {
    value: "ask",
    label: "Ask",
    summary:
      "Ask a question in your own words and get a clear answer from published Stats SA information.",
    capabilities: [
      {
        title: "Plain-language questions",
        description: "No jargon, no forms — just ask.",
      },
      {
        title: "Published sources only",
        description: "Answers come from official publications, releases and datasets.",
      },
      {
        title: "References included",
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
    label: "Media & statements",
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
    <section id="capabilities" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Capabilities
          </p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            What Rafiki helps with
          </h2>
        </div>

        <Tabs defaultValue="ask">
          <TabsList>
            {groups.map((group) => (
              <TabsTrigger key={group.value} value={group.value}>
                {group.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((group) => (
            <TabsContent key={group.value} value={group.value}>
              <Card>
                <CardHeader>
                  <p className="text-sm leading-relaxed text-muted-foreground">{group.summary}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {group.capabilities.map((capability) => (
                    <Item key={capability.title} variant="muted" size="sm">
                      <ItemMedia variant="icon">
                        <Check />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{capability.title}</ItemTitle>
                        <ItemDescription>{capability.description}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
