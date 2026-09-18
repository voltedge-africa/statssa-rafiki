import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "./ai-elements/tool.tsx";
import type { ToolRun } from "@voltedge/agent-contract";

const STATE_MAP: Record<ToolRun["state"], ToolPart["state"]> = {
  running: "input-available",
  done: "output-available",
  error: "output-error",
};

export function ToolRunView({ tool }: { tool: ToolRun }) {
  return (
    <Tool className="mb-2" defaultOpen={false}>
      <ToolHeader type="dynamic-tool" toolName={tool.name} state={STATE_MAP[tool.state]} />
      <ToolContent>
        <ToolInput input={tool.args} />
        <ToolOutput
          output={tool.summary || undefined}
          errorText={tool.state === "error" ? tool.summary : undefined}
        />
      </ToolContent>
    </Tool>
  );
}
