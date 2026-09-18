import { Injectable } from "@nestjs/common";
import type {
  SpanAttributes,
  SpanOptions,
  SpanStatus,
  TelemetryContext,
  TelemetrySpan,
} from "@earendil-works/pi-telemetry";
import type { RecordedSpan, TelemetryStoreEvent } from "@voltedge/agent-contract";

export type { RecordedSpan, TelemetryStoreEvent };

interface InternalSpan {
  id: number;
  parentId: number | null;
  name: string;
  attributes: SpanAttributes;
  events: { name: string; attributes: SpanAttributes; timestamp: number }[];
  status: SpanStatus;
  startedAt: number;
  endedAt?: number;
  settled: boolean;
}

const MAX_SPANS = 500;

function mergeAttributes(current: SpanAttributes, update: SpanAttributes): SpanAttributes {
  return { ...current, ...update };
}

@Injectable()
export class TelemetryService implements TelemetryContext {
  #spans: InternalSpan[] = [];
  #nextId = 1;
  #listeners = new Set<(event: TelemetryStoreEvent) => void>();

  /** Start an event-driven span that is ended explicitly by the caller. */
  begin(name: string, attributes: SpanAttributes = {}, parentId: number | null = null): SpanHandle {
    const span: InternalSpan = {
      id: this.#nextId++,
      parentId,
      name,
      attributes: { ...attributes },
      events: [],
      status: { status: "ok" },
      startedAt: Date.now(),
      settled: false,
    };
    this.#spans.push(span);
    if (this.#spans.length > MAX_SPANS) this.#spans.splice(0, this.#spans.length - MAX_SPANS);
    this.#emit(span);
    return new SpanHandle(this, span);
  }

  startSpan<T>(
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
  ): Promise<T> {
    const handle = this.begin(options.name, options.attributes ?? {});
    return Promise.resolve()
      .then(() => callback(handle))
      .then(
        (value) => {
          handle.end();
          return value;
        },
        (error) => {
          handle.end({
            status: "error",
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: "Error", message: String(error) },
          });
          throw error;
        },
      );
  }

  snapshot(): RecordedSpan[] {
    return this.#spans.map((span) => this.#toRecorded(span));
  }

  subscribe(listener: (event: TelemetryStoreEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#spans = [];
    for (const listener of this.#listeners) listener({ type: "clear" });
  }

  /** @internal */
  update(span: InternalSpan, mutation: () => void): void {
    if (span.settled) return;
    mutation();
    this.#emit(span);
  }

  /** @internal */
  finish(span: InternalSpan, status?: SpanStatus): void {
    if (span.settled) return;
    if (status) span.status = status;
    span.settled = true;
    span.endedAt = Date.now();
    this.#emit(span);
  }

  #emit(span: InternalSpan): void {
    const recorded = this.#toRecorded(span);
    for (const listener of this.#listeners) listener({ type: "span", span: recorded });
  }

  #toRecorded(span: InternalSpan): RecordedSpan {
    return {
      id: span.id,
      parentId: span.parentId,
      name: span.name,
      attributes: { ...span.attributes },
      events: span.events.map((event) => ({
        name: event.name,
        attributes: { ...event.attributes },
        timestamp: event.timestamp,
      })),
      status: span.status.status,
      ...(span.status.status === "error" && span.status.error
        ? { errorMessage: span.status.error.message }
        : {}),
      startedAt: span.startedAt,
      ...(span.endedAt === undefined ? {} : { endedAt: span.endedAt }),
      ...(span.endedAt === undefined ? {} : { durationMs: span.endedAt - span.startedAt }),
      settled: span.settled,
    };
  }
}

export class SpanHandle implements TelemetrySpan {
  #store: TelemetryService;
  #span: InternalSpan;

  constructor(store: TelemetryService, span: InternalSpan) {
    this.#store = store;
    this.#span = span;
  }

  get id(): number {
    return this.#span.id;
  }

  get startedAt(): number {
    return this.#span.startedAt;
  }

  startSpan<T>(
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
  ): Promise<T> {
    const handle = this.#store.begin(options.name, options.attributes ?? {}, this.#span.id);
    return Promise.resolve()
      .then(() => callback(handle))
      .then(
        (value) => {
          handle.end();
          return value;
        },
        (error) => {
          handle.end({
            status: "error",
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: "Error", message: String(error) },
          });
          throw error;
        },
      );
  }

  addEvent(name: string, attributes: SpanAttributes = {}): void {
    this.#store.update(this.#span, () => {
      this.#span.events.push({ name, attributes: { ...attributes }, timestamp: Date.now() });
    });
  }

  setAttributes(attributes: SpanAttributes): void {
    this.#store.update(this.#span, () => {
      this.#span.attributes = mergeAttributes(this.#span.attributes, attributes);
    });
  }

  setStatus(status: SpanStatus): void {
    this.#store.update(this.#span, () => {
      this.#span.status = status;
    });
  }

  end(status?: SpanStatus): void {
    this.#store.finish(this.#span, status);
  }
}
