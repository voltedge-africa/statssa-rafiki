import type { Meta, StoryObj } from "@storybook/react";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "./button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";

const meta = {
  title: "UI/Collapsible",
  component: Collapsible,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-80">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Approved sources</span>
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <ChevronsUpDown />
        </CollapsibleTrigger>
      </div>
      <div className="rounded-lg border border-border/60 p-3">
        <CollapsibleContent>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>Quarterly Labour Force Survey — Q1 2026</li>
            <li>Consumer Price Index — February 2026</li>
            <li>Gross domestic product — Q4 2025</li>
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  ),
};
