import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

const meta = {
  title: "UI/Label",
  component: Label,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    children: "Label",
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label {...args} htmlFor="username">
        Username
      </Label>
      <Input id="username" placeholder="sipho" />
    </div>
  ),
};
