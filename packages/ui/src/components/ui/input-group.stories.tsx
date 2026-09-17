import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "./input-group.tsx";

const meta = {
  title: "UI/InputGroup",
  component: InputGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithButton: Story = {
  render: () => (
    <InputGroup className="w-96">
      <InputGroupInput placeholder="Ask about official statistics…" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>
          <Search />
          Ask
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <InputGroup className="w-96">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search approved publications…" />
    </InputGroup>
  ),
};

export const WithTextarea: Story = {
  render: () => (
    <InputGroup className="w-96">
      <InputGroupTextarea placeholder="Describe the media query…" />
      <InputGroupAddon align="block-end">
        <InputGroupButton variant="ghost" size="sm">
          Clear
        </InputGroupButton>
        <InputGroupButton size="sm">
          <Search />
          Draft response
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};
