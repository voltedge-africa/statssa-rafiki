import type { Meta, StoryObj } from "@storybook/react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert.tsx";
import { Button } from "./button.tsx";

const meta = {
  title: "UI/Alert",
  component: Alert,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive"],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args} className="w-96">
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the shadcn CLI.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: (args) => (
    <Alert {...args} variant="destructive" className="w-96">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline">
          Retry
        </Button>
      </AlertAction>
    </Alert>
  ),
};
