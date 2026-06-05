import Link from "next/link";
import { siteConfig } from "../site-config";
import { cn } from "./ui";

type FooterLinkProps = {
  readonly href: string;
  readonly label: string;
  readonly className?: string;
};

function FooterLink({ href, label, className }: FooterLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2 py-1 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {label}
    </Link>
  );
}

export function SiteFooter() {
  const { brand, footer, legal } = siteConfig;

  return (
    <footer id="site-footer" className="border-t border-border bg-background text-foreground">
      <div className="w-full px-[clamp(24px,4vw,72px)] py-4">
        <div className="grid gap-4 min-[900px]:grid-cols-[minmax(260px,1fr)_auto] min-[900px]:items-start">
          <Link href="/" className="flex max-w-xl items-start gap-3 rounded-md">
            <img
              src="/brand-mark.svg"
              alt=""
              className="mt-0.5 h-8 w-8 shrink-0"
              aria-hidden="true"
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-base font-bold text-card-foreground">{brand.name}</span>
              <span className="text-sm leading-5 text-muted-foreground">{brand.tagline}</span>
              <span className="text-xs font-semibold text-primary">{footer.horizonText}</span>
            </span>
          </Link>

          <nav
            aria-label="页脚主要导航"
            className="flex flex-wrap gap-x-1 gap-y-2 min-[900px]:max-w-[560px] min-[900px]:justify-end"
          >
            {footer.mainNavigation.map((link) => (
              <FooterLink key={link.href} href={link.href} label={link.label} />
            ))}
          </nav>
        </div>

        <div className="mt-3 grid gap-3 border-t border-border pt-3 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{footer.disclaimer}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground min-[900px]:justify-end">
            <span>{footer.copyright}</span>
            <span aria-hidden="true">·</span>
            <nav aria-label="页脚法律与支持链接" className="flex flex-wrap gap-x-1 gap-y-1">
              {footer.legalNavigation.map((link) => (
                <FooterLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  className="px-1.5 py-0.5 text-xs font-medium"
                />
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-2 border-t border-border pt-2 text-center">
          <a
            href={legal.icpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary"
          >
            {legal.icpNumber}
          </a>
        </div>
      </div>
    </footer>
  );
}
