import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  ChartParameters,
  DocumentParameters,
  TableParameters,
  chartBlock,
  documentBlock,
  tableBlock,
  type UiBlock,
} from "./blocks.ts";

function text(value: string) {
  return [{ type: "text" as const, text: value }];
}

export const showTable: AgentTool<typeof TableParameters, { block?: UiBlock }> = {
  name: "show_table",
  label: "Show table",
  description:
    "Render a data table in the interface. Use when the answer is naturally tabular (several rows and columns). Only include figures that appear in passages returned by search_statssa, and set source to the [source#chunk] ids you used. After calling this, give a one-line summary instead of repeating the table in prose.",
  parameters: TableParameters,
  execute: async (_toolCallId, params) => ({
    content: text("Table rendered in the interface."),
    details: { block: tableBlock(params) },
  }),
};

export const showChart: AgentTool<typeof ChartParameters, { block?: UiBlock }> = {
  name: "show_chart",
  label: "Show chart",
  description:
    "Render a line or bar chart in the interface. Use for trends over time (line) or comparisons across categories (bar). Only chart figures that appear in passages returned by search_statssa, and set source to the [source#chunk] ids you used. After calling this, give a one-line summary instead of repeating the numbers in prose.",
  parameters: ChartParameters,
  execute: async (_toolCallId, params) => ({
    content: text("Chart rendered in the interface."),
    details: { block: chartBlock(params) },
  }),
};

export const showDocument: AgentTool<typeof DocumentParameters, { block?: UiBlock }> = {
  name: "show_document",
  label: "Show document",
  description:
    "Open a preview of a source document in the interface. Use when the user asks to see, open, read, or show a document that appeared in search results. The source must be an exact source path returned by search_statssa.",
  parameters: DocumentParameters,
  execute: async (_toolCallId, params) => {
    const { retrieveDocument } = await import("../rag/document.ts");
    const document = retrieveDocument(params.source);
    if (!document) {
      return {
        content: text(`No indexed document found for source "${params.source}".`),
        details: {},
      };
    }
    return {
      content: text(
        `Opened document "${document.source}" (${document.text.length} characters) in the preview.`,
      ),
      details: { block: documentBlock(document.source, document.title, document.text) },
    };
  },
};

export const UI_TOOLS: AgentTool<any, any>[] = [showTable, showChart, showDocument];
