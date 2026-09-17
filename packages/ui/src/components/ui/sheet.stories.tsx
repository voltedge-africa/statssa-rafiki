import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet.tsx";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Review queue</SheetTitle>
          <SheetDescription>
            Drafts awaiting approval by an authorised communications official.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 text-sm text-muted-foreground">
          <span>Media query — youth unemployment (2 references)</span>
          <span>Media query — inflation outlook (4 references)</span>
          <span>Public escalation — census methodology (1 reference)</span>
        </div>
        <SheetFooter>
          <Button>Open control centre</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
