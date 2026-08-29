import { siteConfig } from "../site-config";

export function SiteFooter() {
  const { footer, legal } = siteConfig;

  return (
    <footer
      id="site-footer"
      aria-label="逐光天气页脚"
      className="border-t border-border bg-card/70 text-muted-foreground"
    >
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-[clamp(16px,4vw,64px)] py-5 text-center text-xs leading-5 sm:py-6 sm:text-sm">
        <span>{footer.copyright}</span>
        <span aria-hidden="true" className="hidden text-muted-foreground/70 min-[420px]:inline">
          •
        </span>
        <a
          href={legal.icpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full rounded-md px-1 py-0.5 font-medium transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {legal.icpNumber}
        </a>
      </div>
    </footer>
  );
}
