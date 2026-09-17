import type { Meta, StoryObj } from "@storybook/react";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./field.tsx";
import { Input } from "./input.tsx";

const meta = {
  title: "UI/Field",
  component: Field,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <FieldGroup className="w-80">
      <Field>
        <FieldLabel htmlFor="field-email">Work email</FieldLabel>
        <Input id="field-email" type="email" placeholder="name@statssa.gov.za" />
        <FieldDescription>Access is provisioned by a Stats SA administrator.</FieldDescription>
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="field-password">Password</FieldLabel>
        <Input id="field-password" type="password" aria-invalid />
        <FieldError>Password must be at least 12 characters.</FieldError>
      </Field>
    </FieldGroup>
  ),
};
