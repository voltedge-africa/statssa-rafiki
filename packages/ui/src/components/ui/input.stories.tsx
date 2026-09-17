import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    placeholder: "you@example.com",
    type: "email",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Input {...args} className="w-72" />,
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="email">Email</Label>
      <Input {...args} id="email" />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => <Input {...args} className="w-72" disabled value="disabled@example.com" />,
};
