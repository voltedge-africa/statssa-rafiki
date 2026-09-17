import type { Meta, StoryObj } from "@storybook/react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion.tsx";

const meta = {
  title: "UI/Accordion",
  component: Accordion,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion className="w-96" defaultValue={["sources"]}>
      <AccordionItem value="sources">
        <AccordionTrigger>Where do answers come from?</AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground">
            Only approved Stats SA publications, releases, datasets and communication material.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="review">
        <AccordionTrigger>Is a human involved?</AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground">
            Complex, sensitive and media queries are always reviewed and approved by an authorised
            official.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="gaps">
        <AccordionTrigger>What if there is no approved answer?</AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground">
            The assistant flags the information gap instead of guessing.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
