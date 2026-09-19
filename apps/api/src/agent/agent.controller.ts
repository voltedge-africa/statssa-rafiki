import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthUser } from "@voltedge/auth-contract";
import type { ChatEvent, ChatRequest } from "@voltedge/agent-contract";
import { GovernanceService } from "../admin/governance.service.ts";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { OptionalAuth } from "../auth/optional-auth.decorator.ts";
import { Public } from "../auth/public.decorator.ts";
import { AgentService, type TelemetryOrigin } from "./agent.service.ts";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Best-effort, non-personal portal host from the request headers. */
function requestOrigin(req: Request): string | undefined {
  const source = req.headers.origin ?? req.headers.referer;
  if (typeof source !== "string") return undefined;
  try {
    return new URL(source).host;
  } catch {
    return undefined;
  }
}

@Controller("api")
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly governance: GovernanceService,
  ) {}

  @Get("status")
  @Public()
  status() {
    return this.agent.providerStatus();
  }

  @Post("chat")
  @OptionalAuth()
  async chat(
    @Body() body: Partial<ChatRequest> | undefined,
    @Req() req: Request,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    if (!body.message || typeof body.message !== "string" || body.message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Kill switch: the governance settings can disable all model generation. We answer
    // on the normal SSE channel so the chat surface shows a clear message, not a hang.
    if (!(await this.governance.isGenerationEnabled())) {
      res.writeHead(200, SSE_HEADERS);
      const blocked: ChatEvent = {
        type: "error",
        message: "AI generation is disabled by an administrator.",
      };
      res.write(`data: ${JSON.stringify(blocked)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return;
    }

    res.writeHead(200, SSE_HEADERS);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, 15_000);

    const send = (event: ChatEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const host = requestOrigin(req);
    const origin: TelemetryOrigin = {
      feature: "chat",
      clientRole: user?.role ?? "anonymous",
      ...(host ? { clientOrigin: host } : {}),
    };

    try {
      await this.agent.runChat({ sessionId: body.sessionId, message: body.message }, send, origin);
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      send({ type: "done" });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Non-streaming reply endpoint for automated public clients (the WhatsApp relay).
   *
   * `@Public()` attaches no user, so a caller can never be elevated to a staff/admin/media role —
   * not even by sending a token. It runs the same public chat path and public-data tools as the
   * website and returns one formatted answer; the relay does no access filtering of its own.
   */
  @Post("chat/final")
  @Public()
  async chatFinal(@Body() body: Partial<ChatRequest> | undefined, @Req() req: Request) {
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      throw new BadRequestException("sessionId is required");
    }
    if (!body.message || typeof body.message !== "string" || body.message.trim() === "") {
      throw new BadRequestException("message is required");
    }

    if (!(await this.governance.isGenerationEnabled())) {
      return {
        answer: "AI generation is disabled by an administrator.",
        grounded: "",
        formatterModel: "",
        usedFallback: true,
        tables: [],
      };
    }

    const host = requestOrigin(req);
    return this.agent.runFinalReply(
      { sessionId: body.sessionId, message: body.message },
      { feature: "openwa_reply", clientRole: "anonymous", ...(host ? { clientOrigin: host } : {}) },
    );
  }

  @Post("reset")
  @Public()
  @HttpCode(200)
  reset(@Body() body: { sessionId?: string } | undefined) {
    return { cleared: body?.sessionId ? this.agent.resetSession(body.sessionId) : false };
  }
}
