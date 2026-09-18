import type { Meta, StoryObj } from "@storybook/react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel.tsx";

const meta = {
  title: "UI/Carousel",
  component: Carousel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

const slides = ["Slide one", "Slide two", "Slide three"];

export const Default: Story = {
  render: () => (
    <Carousel className="w-72">
      <CarouselContent>
        {slides.map((slide, index) => (
          <CarouselItem key={slide}>
            <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-sm">
              {slide} ({index + 1}/{slides.length})
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};
