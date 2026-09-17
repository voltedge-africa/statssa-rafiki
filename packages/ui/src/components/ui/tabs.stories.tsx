import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.tsx";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    defaultValue: "public",
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList>
        <TabsTrigger value="public">Public</TabsTrigger>
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>
      <TabsContent value="public">
        <div className="flex flex-col gap-2 p-1 text-sm text-muted-foreground">
          <span>Ask a question in plain language.</span>
          <span>Every answer cites its approved sources.</span>
        </div>
      </TabsContent>
      <TabsContent value="media">
        <div className="flex flex-col gap-2 p-1 text-sm text-muted-foreground">
          <span>Media queries are drafted, never auto-published.</span>
          <Badge variant="outline">Awaiting approval</Badge>
        </div>
      </TabsContent>
      <TabsContent value="staff">
        <div className="flex flex-col gap-2 p-1 text-sm text-muted-foreground">
          <span>Review, edit and approve drafts.</span>
          <span>Approve or return with full citation context.</span>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="public">Public</TabsTrigger>
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>
      <TabsContent value="public">
        <p className="p-1 text-sm text-muted-foreground">Self-service search for everyone.</p>
      </TabsContent>
    </Tabs>
  ),
};
