import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.tsx";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./button-group.tsx";

const meta = {
  title: "UI/ButtonGroup",
  component: ButtonGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Previous</Button>
      <Button variant="outline">Next</Button>
    </ButtonGroup>
  ),
};

export const WithSeparatorAndText: Story = {
  render: () => (
    <ButtonGroup>
      <ButtonGroupText>Page</ButtonGroupText>
      <ButtonGroupSeparator />
      <Button variant="outline">1</Button>
      <Button variant="outline">2</Button>
      <Button variant="outline">3</Button>
    </ButtonGroup>
  ),
};
