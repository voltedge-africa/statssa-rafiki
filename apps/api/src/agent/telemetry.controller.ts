import { Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import type { TelemetryStoreEvent } from "@voltedge/agent-contract";
import { Roles } from "../auth/roles.decorator.ts";
import { TelemetryService } from "./telemetry.service.ts";

/**
 * Live, in-memory telemetry for operators. Admin-only: it exposes model
 * operation metadata across all sessions, and `clear` mutates shared state.
 */
@Controller("api/telemetry")
@Roles("Admin")
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get()
  snapshot() {
    return { spans: this.telemetry.snapshot() };
  }

  @Post("clear")
  @HttpCode(200)
  clear() {
    this.telemetry.clear();
    return { cleared: true };
  }

  @Get("stream")
  stream(@Res() res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: TelemetryStoreEvent | { type: "snapshot"; spans: unknown }) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: "snapshot", spans: this.telemetry.snapshot() });
    const unsubscribe = this.telemetry.subscribe(send);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, 15_000);

    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
