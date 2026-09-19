import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatSurface } from "@voltedge/ai-chat";
import { env } from "./env.ts";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

const SUGGESTIONS = [
  "Show a table of household asset ownership by rural, urban and metro, 2025.",
  "Chart the share of households with any internet access by province, 2025.",
  "Compare the GHS 2025 response rate in Limpopo with the national rate.",
  "How has access to improved sanitation changed since 2002?",
  "How are the GHS 2025 survey weights calibrated?",
  "What does the GHS 2025 report say about food inadequacy?",
  "Open the GHS 2025 media release.",
  "Calculate the urban-rural refuse removal gap in the GHS 2025 media release.",
  "What was South Africa's GDP growth rate in 2025?",
];

createRoot(root).render(
  <StrictMode>
    <ChatSurface
      apiBase={env.apiBase}
      emptyStateImage="/statssa-arms-gray.webp"
      suggestions={SUGGESTIONS}
    />
  </StrictMode>,
);
