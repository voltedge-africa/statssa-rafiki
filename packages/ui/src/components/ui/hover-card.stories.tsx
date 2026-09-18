import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card.tsx";

const meta = {
  title: "UI/HoverCard",
  component: HoverCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger render={<Button variant="outline">CPI methodology</Button>} />
      <HoverCardContent className="w-72">
        <p className="text-sm font-medium">Consumer Price Index</p>
        <p className="text-sm text-muted-foreground">
          Measures the change over time in the prices of a representative basket of goods and
          services.
        </p>
      </HoverCardContent>
    </HoverCard>
  ),
};
