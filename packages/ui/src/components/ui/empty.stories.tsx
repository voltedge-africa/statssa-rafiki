import type { Meta, StoryObj } from "@storybook/react";
import { FileSearch, Plus } from "lucide-react";

import { Button } from "./button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty.tsx";

const meta = {
  title: "UI/Empty",
  component: Empty,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-96 rounded-xl border border-dashed border-border">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearch />
          </EmptyMedia>
          <EmptyTitle>No approved sources found</EmptyTitle>
          <EmptyDescription>
            The assistant could not find an approved Stats SA source for this question. It will flag
            the information gap instead of guessing.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm">
            <Plus />
            Request a source
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  ),
};
