import type { Meta, StoryObj } from "@storybook/react";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@voltedge/ui";

import { App } from "./App.tsx";

const meta = {
  title: "Website/App",
  component: App,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UIComponentsFromPackage: Story = {
  render: () => (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-96">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>VE</AvatarFallback>
            </Avatar>
            VoltEdge UI
            <Badge variant="secondary">v0</Badge>
          </CardTitle>
          <CardDescription>
            Components imported from <code className="font-mono">@voltedge/ui</code>.
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm">
              Dismiss
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="storybook-email">Email</Label>
            <Input id="storybook-email" placeholder="you@example.com" />
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" size="sm">
            Cancel
          </Button>
          <Button size="sm">Subscribe</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};
