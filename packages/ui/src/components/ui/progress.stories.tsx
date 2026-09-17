import type { Meta, StoryObj } from "@storybook/react";

import { Progress, ProgressLabel, ProgressValue } from "./progress.tsx";

const meta = {
  title: "UI/Progress",
  component: Progress,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    value: 94,
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SourceConfidence: Story = {
  render: (args) => (
    <div className="w-80">
      <Progress {...args}>
        <ProgressLabel>Source confidence</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  ),
};

export const LowConfidence: Story = {
  render: (args) => (
    <div className="w-80">
      <Progress {...args} value={38}>
        <ProgressLabel>Source confidence</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  ),
};
