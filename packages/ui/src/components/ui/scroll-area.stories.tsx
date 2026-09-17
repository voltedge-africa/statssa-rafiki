import type { Meta, StoryObj } from "@storybook/react";

import { ScrollArea } from "./scroll-area.tsx";

const sources = [
  "Quarterly Labour Force Survey — Q1 2026",
  "Consumer Price Index — February 2026",
  "Gross domestic product — Q4 2025",
  "General Household Survey — 2025",
  "Living Conditions Survey — 2024/25",
  "Mining production and sales — March 2026",
  "Retail trade sales — February 2026",
  "Tourism satellite account — 2025",
];

const meta = {
  title: "UI/ScrollArea",
  component: ScrollArea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-48 w-72 rounded-lg border border-border/60">
      <div className="flex flex-col gap-2 p-3">
        {sources.map((source) => (
          <span key={source} className="text-sm text-muted-foreground">
            {source}
          </span>
        ))}
      </div>
    </ScrollArea>
  ),
};
