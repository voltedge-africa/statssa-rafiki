import { Button } from "@voltedge/ui";

import { publicPortalUrl } from "../lib/public-portal.ts";

const sources = [
  {
    code: "P0211",
    title: "Quarterly Labour Force Survey, Q1 2026",
    meta: "Statistical release, published 12 May 2026",
  },
  {
    code: "P0211.4.2",
    title: "Youth unemployment in South Africa, Q1 2026",
    meta: "Statistical release, published 20 May 2026",
  },
];

const promises = [
  {
    label: "ask",
    title: "Plain language in",
    body: "Type the question the way you would say it. No forms, no filters, no jargon.",
  },
  {
    label: "verify",
    title: "Documents attached",
    body: "Each answer lists the releases and datasets behind it, with their series codes.",
  },
  {
    label: "route",
    title: "People decide",
    body: "Media and sensitive questions get a referenced draft for an official to approve.",
  },
];

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate px-6 pt-14 pb-12 sm:px-10 sm:pt-20 sm:pb-16 lg:px-14 lg:pt-24 lg:pb-20"
    >
      <img
        src="/statssa-arms-gray.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -top-4 right-0 -z-10 hidden w-[340px] [mask-image:linear-gradient(to_bottom,black_38%,transparent_88%)] select-none lg:block xl:w-[400px]"
      />

      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-20">
        <h1
          className="font-heading text-[2.5rem] leading-[1.03] font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[3.5rem]"
          data-reveal
        >
          Ask Statistics South Africa.
          <span className="mt-1 block text-primary">Every answer shows its sources.</span>
        </h1>
        <div className="flex flex-col gap-6">
          <p
            className="max-w-md leading-relaxed text-muted-foreground"
            data-reveal
            style={{ animationDelay: "80ms" }}
          >
            Rafiki works from published Stats SA releases, datasets and publications. Ask in plain
            language, read the answer, then open the document it came from.
          </p>
          <div
            className="flex flex-wrap items-center gap-3"
            data-reveal
            style={{ animationDelay: "140ms" }}
          >
            <Button size="lg" nativeButton={false} render={<a href={publicPortalUrl()} />}>
              Ask a question
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href="#ask" />}>
              See an example answer
            </Button>
          </div>
        </div>
      </div>

      <div id="ask" className="mt-14 border border-border sm:mt-20" data-reveal>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
          <span className="font-mono text-[11px] text-muted-foreground">question</span>
          <span className="font-mono text-[11px] text-muted-foreground">public search</span>
        </div>

        <p className="border-b border-border px-4 py-5 font-heading text-lg font-medium sm:px-6 sm:text-xl">
          What was the unemployment rate in the first quarter of 2026?
        </p>

        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:border-r lg:border-border">
            <div className="flex flex-col gap-4">
              <span className="font-mono text-[11px] text-muted-foreground">answer</span>
              <p className="max-w-[46ch] text-lg leading-relaxed">
                The official unemployment rate was <span className="tabular-nums">32,1%</span> in
                the first quarter of 2026, down <span className="tabular-nums">0,4</span> of a
                percentage point from the fourth quarter of 2025. The expanded unemployment rate was{" "}
                <span className="tabular-nums">42,4%</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[11px] text-muted-foreground">grounded</span>
              <span className="h-1.5 w-40 bg-muted">
                <span className="block h-full w-[94%] bg-brand" />
              </span>
              <span className="font-mono text-[11px] text-brand">both sources are published</span>
            </div>
          </div>

          <div className="flex flex-col border-t border-border px-4 py-6 sm:px-6 sm:py-8 lg:border-t-0">
            <span className="font-mono text-[11px] text-muted-foreground">sources</span>
            <ul className="mt-2 flex flex-col">
              {sources.map((source, index) => (
                <li
                  key={source.code}
                  className={
                    index > 0
                      ? "flex flex-col gap-1 border-t border-border py-4"
                      : "flex flex-col gap-1 py-4"
                  }
                >
                  <span className="font-mono text-xs text-primary">{source.code}</span>
                  <span className="text-sm font-medium">{source.title}</span>
                  <span className="text-xs text-muted-foreground">{source.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-10 grid border border-border sm:grid-cols-3">
        {promises.map((promise, index) => (
          <div
            key={promise.label}
            className={
              index > 0
                ? "flex flex-col gap-3 border-t border-border px-5 py-6 sm:border-t-0 sm:border-l"
                : "flex flex-col gap-3 px-5 py-6"
            }
          >
            <span className="font-mono text-[11px] text-muted-foreground">{promise.label}</span>
            <span className="font-heading text-base font-medium">{promise.title}</span>
            <p className="text-sm leading-relaxed text-muted-foreground">{promise.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
