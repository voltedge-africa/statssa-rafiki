import type { Meta, StoryObj } from "@storybook/react";

import { Textarea } from "./textarea.tsx";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    placeholder: "Describe the media query…",
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Textarea {...args} className="w-96" />,
};

export const Disabled: Story = {
  render: (args) => (
    <Textarea {...args} className="w-96" disabled value="Media query intake is closed." />
  ),
};
