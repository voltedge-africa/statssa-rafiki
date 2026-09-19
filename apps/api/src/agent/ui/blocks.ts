import { Type, type Static } from "@earendil-works/pi-ai";
import type { SourceItem, UiBlock } from "@voltedge/agent-contract";

export type { SourceItem, UiBlock };

const ALLOWED_COMPONENTS = new Set(["table", "chart", "sources", "document"]);

export const TableParameters = Type.Object({
  title: Type.Optional(Type.String({ description: "Short title shown above the table." })),
  columns: Type.Array(Type.String(), {
    minItems: 1,
    description: "Column headers, in display order.",
  }),
  rows: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number()])), {
    description: "Row data. Each row should have one value per column.",
  }),
  source: Type.Optional(
    Type.String({
      description: "Source ids backing the figures, e.g. 'ghs-2025-statistical-release.md#12'.",
    }),
  ),
});

export const ChartParameters = Type.Object({
  title: Type.Optional(Type.String({ description: "Short title shown above the chart." })),
  kind: Type.Union([Type.Literal("line"), Type.Literal("bar")], {
    description: "line for trends over time, bar for comparisons.",
  }),
  xLabel: Type.Optional(Type.String()),
  yLabel: Type.Optional(Type.String()),
  categories: Type.Array(Type.String(), { description: "X-axis labels, in order." }),
  series: Type.Array(
    Type.Object({
      name: Type.String(),
      values: Type.Array(Type.Number(), { description: "One value per category." }),
    }),
    { minItems: 1 },
  ),
  source: Type.Optional(Type.String({ description: "Source ids backing the figures." })),
});

export const DocumentParameters = Type.Object({
  source: Type.String({
    description:
      "Exact document source path returned by search_statssa, e.g. 'ghs-2025-media-release.md'.",
  }),
});

export type TableParams = Static<typeof TableParameters>;
export type ChartParams = Static<typeof ChartParameters>;
export type DocumentParams = Static<typeof DocumentParameters>;

function padRow(row: (string | number)[], width: number): (string | number)[] {
  if (row.length === width) return row;
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

export function tableBlock(params: TableParams): UiBlock {
  const width = params.columns.length;
  const rows = params.rows.map((row) => padRow(row, width));
  return {
    component: "table",
    ...(params.title ? { title: params.title } : {}),
    columns: params.columns,
    rows,
    ...(params.source ? { source: params.source } : {}),
  };
}

export function chartBlock(params: ChartParams): UiBlock {
  for (const series of params.series) {
    if (series.values.length !== params.categories.length) {
      throw new Error(
        `Series "${series.name}" has ${series.values.length} values but there are ${params.categories.length} categories.`,
      );
    }
  }
  return {
    component: "chart",
    kind: params.kind,
    ...(params.title ? { title: params.title } : {}),
    ...(params.xLabel ? { xLabel: params.xLabel } : {}),
    ...(params.yLabel ? { yLabel: params.yLabel } : {}),
    categories: params.categories,
    series: params.series,
    ...(params.source ? { source: params.source } : {}),
  };
}

export function sourcesBlock(items: SourceItem[], title = "Sources"): UiBlock {
  return { component: "sources", title, items };
}

export function documentBlock(source: string, title: string | null, text: string): UiBlock {
  return { component: "document", source, title, text };
}

export function extractUiBlock(details: unknown): UiBlock | undefined {
  if (!details || typeof details !== "object" || !("block" in details)) return undefined;
  const block = (details as { block?: unknown }).block;
  if (!block || typeof block !== "object" || !("component" in block)) return undefined;
  const component = (block as { component?: unknown }).component;
  if (typeof component !== "string" || !ALLOWED_COMPONENTS.has(component)) return undefined;
  return block as UiBlock;
}
