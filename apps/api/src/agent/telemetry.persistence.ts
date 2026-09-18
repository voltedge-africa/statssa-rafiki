import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { TelemetryStoreEvent } from "@voltedge/agent-contract";
import { toAiSpanWrite, type AiSpanWrite } from "./telemetry.flatten.ts";
import { TelemetryRepository } from "./telemetry.repository.ts";
import { TelemetryService } from "./telemetry.service.ts";

const FLUSH_INTERVAL_MS = 500;
const MAX_BUFFER = 200;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Durable sink for the in-memory `TelemetryService`.
 *
 * Subscribes to settled spans, flattens them to `ai_spans` rows and writes them
 * in small batches. Every failure is logged and swallowed: pi requires that
 * recording telemetry never changes whether the agent run succeeds.
 */
@Injectable()
export class TelemetryPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryPersistenceService.name);
  private unsubscribe: (() => void) | undefined;
  private buffer: AiSpanWrite[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing = false;

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly repo: TelemetryRepository,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.telemetry.subscribe((event) => this.capture(event));
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
  }

  private capture(event: TelemetryStoreEvent): void {
    // Only settled spans are durable; in-flight updates stay in memory for the
    // live stream.
    if (event.type !== "span" || !event.span.settled) return;

    try {
      this.buffer.push(toAiSpanWrite(event.span));
    } catch (error) {
      this.logger.warn(`Could not flatten span "${event.span.name}": ${message(error)}`);
      return;
    }

    if (this.buffer.length >= MAX_BUFFER) void this.flush();
    else this.schedule();
  }

  private schedule(): void {
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.timer.unref?.();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer;
    this.buffer = [];

    try {
      await this.repo.insertSpans(batch);
    } catch (error) {
      this.logger.warn(`Could not persist ${batch.length} telemetry span(s): ${message(error)}`);
    } finally {
      this.flushing = false;
      if (this.buffer.length > 0) this.schedule();
    }
  }
}
