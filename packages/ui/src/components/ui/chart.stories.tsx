import type { Meta, StoryObj } from "@storybook/react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./chart.tsx";

const meta = {
  title: "UI/Chart",
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const data = [
  { year: "2021", inflation: 4.5 },
  { year: "2022", inflation: 6.9 },
  { year: "2023", inflation: 6.0 },
  { year: "2024", inflation: 4.4 },
];

const config = {
  inflation: { label: "Headline inflation", color: "var(--chart-1)" },
} satisfies ChartConfig;

export const BarChartStory: Story = {
  name: "Bar",
  render: () => (
    <ChartContainer config={config} className="h-[240px] w-[420px]">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="inflation" fill="var(--color-inflation)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};
