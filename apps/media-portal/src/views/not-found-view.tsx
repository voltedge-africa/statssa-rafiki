import { Button } from "@voltedge/ui";

export function NotFoundView() {
  return (
    <section className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          404
        </span>
        <h1 className="font-heading text-2xl font-medium">No page at this address</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The page you followed does not exist. Head back to the media room to file or track a
          fact-check request.
        </p>
        <Button nativeButton={false} render={<a href="/" />}>
          Back to the media room
        </Button>
      </div>
    </section>
  );
}
