import type { Meta, StoryObj } from "@storybook/react";

import { Capabilities } from "./capabilities.tsx";
import { Faq } from "./faq.tsx";
import { Governance } from "./governance.tsx";
import { Hero } from "./hero.tsx";
import { HowItWorks } from "./how-it-works.tsx";
import { SiteFooter } from "./site-footer.tsx";
import { SiteHeader } from "./site-header.tsx";

const meta = {
  title: "Website/Sections",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  render: () => <SiteHeader />,
};

export const HeroSection: Story = {
  render: () => <Hero />,
};

export const HowItWorksSection: Story = {
  render: () => <HowItWorks />,
};

export const CapabilitiesSection: Story = {
  render: () => <Capabilities />,
};

export const GovernanceSection: Story = {
  render: () => <Governance />,
};

export const FaqSection: Story = {
  render: () => <Faq />,
};

export const Footer: Story = {
  render: () => <SiteFooter />,
};
