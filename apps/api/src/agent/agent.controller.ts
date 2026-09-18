import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ChatEvent, ChatRequest } from "@voltedge/agent-contract";
import { Public } from "../auth/public.decorator.ts";
import { AgentService } from "./agent.service.ts";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

@Controller("api")
@Public()
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get("status")
  status() {
    return this.agent.providerStatus();
  }

  @Post("chat")
  async chat(@Body() body: Partial<ChatRequest> | undefined, @Res() res: Response): Promise<void> {
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    if (!body.message || typeof body.message !== "string" || body.message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    res.writeHead(200, SSE_HEADERS);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, 15_000);

    const send = (event: ChatEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.agent.runChat({ sessionId: body.sessionId, message: body.message }, send);
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      send({ type: "done" });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  @Post("reset")
  @HttpCode(200)
  reset(@Body() body: { sessionId?: string } | undefined) {
    return { cleared: body?.sessionId ? this.agent.resetSession(body.sessionId) : false };
  }
}
