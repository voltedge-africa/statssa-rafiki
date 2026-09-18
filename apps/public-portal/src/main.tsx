import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatSurface } from "@voltedge/ai-chat";
import { env } from "./env.ts";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <ChatSurface
      apiBase={env.apiBase}
      emptyStateImage="/statssa-arms-gray.webp"
      suggestions={[
        "Chart headline inflation 2021–2024",
        "CPI index and inflation by year",
        "Headline vs core inflation",
      ]}
    />
  </StrictMode>,
);
