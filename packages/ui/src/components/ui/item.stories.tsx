import type { Meta, StoryObj } from "@storybook/react";
import { FileText, Newspaper, ShieldCheck } from "lucide-react";

import { Button } from "./button.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./item.tsx";

const meta = {
  title: "UI/Item",
  component: Item,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ItemGroup className="w-96">
      <Item>
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Quarterly Labour Force Survey — Q1 2026</ItemTitle>
          <ItemDescription>Statistical release P0211</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm">
            Open
          </Button>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item variant="outline">
        <ItemMedia variant="icon">
          <Newspaper />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Media statement — youth unemployment</ItemTitle>
          <ItemDescription>Approved 20 May 2026</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <ShieldCheck />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Approved response reuse</ItemTitle>
          <ItemDescription>Recommended from communication memory</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
};
