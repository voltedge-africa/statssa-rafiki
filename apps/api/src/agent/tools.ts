import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { searchStatsSa } from "./rag/tool.ts";
import { UI_TOOLS } from "./ui/tools.ts";

const CalculateParameters = Type.Object({
  expression: Type.String({
    description:
      "Arithmetic expression using numbers and the operators + - * / % ^ and parentheses. Example: ((1250000 - 980000) / 980000) * 100",
  }),
});

const PRECEDENCE: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "%": 3, "^": 4 };

function evaluateExpression(input: string): number {
  if (input.trim() === "") throw new Error("Expression is empty");

  const tokens = input.match(/\d+\.?\d*|\.\d+|[+\-*/%^()]/g);
  if (!tokens) throw new Error("Expression contains no numbers");

  const leftover = input.replace(/\d+\.?\d*|\.\d*|[+\-*/%^()\s]/g, "");
  if (leftover.length > 0) throw new Error(`Unsupported characters: ${leftover}`);

  const output: (number | string)[] = [];
  const operators: string[] = [];
  let expectUnary = true;

  for (const token of tokens) {
    if (/^\d|^\./.test(token)) {
      output.push(Number(token));
      expectUnary = false;
      continue;
    }

    if (token === "(") {
      operators.push(token);
      expectUnary = true;
      continue;
    }

    if (token === ")") {
      while (operators.length > 0 && operators[operators.length - 1] !== "(") {
        output.push(operators.pop() as string);
      }
      if (operators.pop() !== "(") throw new Error("Unbalanced parentheses");
      expectUnary = false;
      continue;
    }

    const unary = expectUnary && (token === "-" || token === "+");
    if (unary) {
      operators.push(token === "-" ? "u-" : "u+");
      expectUnary = true;
      continue;
    }

    while (operators.length > 0) {
      const top = operators[operators.length - 1];
      if (top === "(") break;
      const higher = PRECEDENCE[top] > PRECEDENCE[token];
      const equalLeftAssoc = PRECEDENCE[top] === PRECEDENCE[token] && token !== "^";
      if (!higher && !equalLeftAssoc) break;
      output.push(operators.pop() as string);
    }
    operators.push(token);
    expectUnary = true;
  }

  while (operators.length > 0) {
    const op = operators.pop() as string;
    if (op === "(") throw new Error("Unbalanced parentheses");
    output.push(op);
  }

  const stack: number[] = [];
  for (const token of output) {
    if (typeof token === "number") {
      stack.push(token);
      continue;
    }
    if (token === "u-") {
      const a = stack.pop();
      if (a === undefined) throw new Error("Malformed expression");
      stack.push(-a);
      continue;
    }
    if (token === "u+") continue;

    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error("Malformed expression");
    switch (token) {
      case "+":
        stack.push(a + b);
        break;
      case "-":
        stack.push(a - b);
        break;
      case "*":
        stack.push(a * b);
        break;
      case "/":
        if (b === 0) throw new Error("Division by zero");
        stack.push(a / b);
        break;
      case "%":
        if (b === 0) throw new Error("Division by zero");
        stack.push(a % b);
        break;
      case "^":
        stack.push(a ** b);
        break;
      default:
        throw new Error(`Unknown operator: ${token}`);
    }
  }

  if (stack.length !== 1) throw new Error("Malformed expression");
  const result = stack[0];
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}

const calculateTool: AgentTool<typeof CalculateParameters, { result: number }> = {
  name: "calculate",
  label: "Calculate",
  description:
    "Evaluate an arithmetic expression exactly. Use for percentages, ratios, growth rates and other numeric work instead of doing mental math.",
  parameters: CalculateParameters,
  execute: async (_toolCallId, params) => {
    const result = evaluateExpression(params.expression);
    return {
      content: [{ type: "text", text: `${params.expression} = ${result}` }],
      details: { result },
    };
  },
};

const TimeParameters = Type.Object({
  timeZone: Type.Optional(
    Type.String({
      description: "IANA time zone. Defaults to Africa/Johannesburg.",
    }),
  ),
});

const timeTool: AgentTool<typeof TimeParameters, { iso: string }> = {
  name: "current_time",
  label: "Current time",
  description:
    "Return the current date and time, defaulting to South African Standard Time. Use for questions about 'today', 'this year' or recency of statistics.",
  parameters: TimeParameters,
  execute: async (_toolCallId, params) => {
    const timeZone = params.timeZone ?? "Africa/Johannesburg";
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone,
    }).format(now);
    return {
      content: [{ type: "text", text: `${formatted} (${timeZone}) — ISO ${now.toISOString()}` }],
      details: { iso: now.toISOString() },
    };
  },
};

export const TOOLS: AgentTool<any, any>[] = [searchStatsSa, ...UI_TOOLS, calculateTool, timeTool];
