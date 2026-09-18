import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatSurface } from "@voltedge/ai-chat";
import "./index.css";

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:3002";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <ChatSurface apiBase={apiBase} title="Public portal" subtitle="Stats SA assistant" />
  </StrictMode>,
);
