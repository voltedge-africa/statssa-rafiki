import { publicPortalUrl, websiteUrl } from "../env.ts";

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-8 sm:px-10 lg:px-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Statistics South Africa
          </span>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Responses are prepared only from approved, published Stats SA sources and reviewed by a
            communications official before release.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm">
          <a href={websiteUrl()} className="text-muted-foreground hover:text-foreground">
            statssa.gov.za
          </a>
          <a href={publicPortalUrl()} className="text-muted-foreground hover:text-foreground">
            Public search
          </a>
        </nav>
      </div>
    </footer>
  );
}
