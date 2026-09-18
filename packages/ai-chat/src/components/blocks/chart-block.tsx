import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@voltedge/ui";
import type { UiBlock } from "@voltedge/agent-contract";

type ChartBlockType = Extract<UiBlock, { component: "chart" }>;

export function ChartBlock({ block }: { block: ChartBlockType }) {
  const data = block.categories.map((category, index) => {
    const row: Record<string, string | number> = { category };
    block.series.forEach((series, seriesIndex) => {
      row[`series-${seriesIndex}`] = series.values[index] ?? 0;
    });
    return row;
  });

  const config: ChartConfig = Object.fromEntries(
    block.series.map((series, index) => [
      `series-${index}`,
      { label: series.name, color: `var(--chart-${(index % 5) + 1})` },
    ]),
  );

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="category" tickLine={false} axisLine={false} fontSize={11} />
      <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
      <ChartTooltip content={<ChartTooltipContent />} />
    </>
  );

  return (
    <Card className="my-3 gap-0 py-0">
      {block.title && (
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">{block.title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-3">
        <ChartContainer config={config} className="h-[260px] w-full">
          {block.kind === "line" ? (
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              {axes}
              {block.series.map((series, index) => (
                <Line
                  key={series.name}
                  dataKey={`series-${index}`}
                  stroke={`var(--color-series-${index})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              {axes}
              {block.series.map((series, index) => (
                <Bar
                  key={series.name}
                  dataKey={`series-${index}`}
                  fill={`var(--color-series-${index})`}
                  radius={4}
                />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
      {block.source && (
        <CardFooter className="border-t py-2 text-xs text-muted-foreground">
          Source: {block.source}
        </CardFooter>
      )}
    </Card>
  );
}
