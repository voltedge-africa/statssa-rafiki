import type { Meta, StoryObj } from "@storybook/react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Audience: Story = {
  render: () => (
    <Select defaultValue="media">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Audience</SelectLabel>
          <SelectItem value="public">Public</SelectItem>
          <SelectItem value="media">Media</SelectItem>
          <SelectItem value="government">Government</SelectItem>
          <SelectItem value="social">Social media</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Format: Story = {
  render: () => (
    <Select defaultValue="draft">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Communication format</SelectLabel>
          <SelectItem value="draft">Draft media response</SelectItem>
          <SelectItem value="advisory">Media advisory</SelectItem>
          <SelectItem value="statement">Press statement</SelectItem>
          <SelectItem value="faq">FAQ</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
