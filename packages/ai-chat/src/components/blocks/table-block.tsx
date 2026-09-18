import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voltedge/ui";
import type { UiBlock } from "@voltedge/agent-contract";

type TableBlockType = Extract<UiBlock, { component: "table" }>;

export function TableBlock({ block }: { block: TableBlockType }) {
  return (
    <Card className="my-3 gap-0 overflow-hidden py-0">
      {block.title && (
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">{block.title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {block.columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{String(cell)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {block.source && (
        <CardFooter className="border-t py-2 text-xs text-muted-foreground">
          Source: {block.source}
        </CardFooter>
      )}
    </Card>
  );
}
