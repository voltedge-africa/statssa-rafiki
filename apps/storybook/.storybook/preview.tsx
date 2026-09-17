import type { Preview } from "@storybook/react-vite";

import { SessionProvider } from "../../website/src/lib/session.tsx";
import "./preview.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ["UI", "Website"],
      },
    },
  },
  decorators: [
    (Story) => (
      <SessionProvider>
        <Story />
      </SessionProvider>
    ),
  ],
};

export default preview;
